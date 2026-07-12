import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DEFAULT_HOUSEHOLD_ID, type AppDatabase } from "../db/client.js";
import { groceryItems, pantryItems } from "../db/schema.js";
import {
  projectUpdatePantry,
  type ApplyReport,
  type PantryManagerGroceryLine,
  type PantryManagerIngredient,
  type PantryManagerPantryRow,
} from "../domain/pantry-manager.js";
import {
  MAX_PANTRY_ITEMS_PER_HOUSEHOLD,
  type PantryItem,
} from "../domain/pantry-item.js";
import { validationError } from "../domain/errors.js";
import { GroceryItemService } from "./grocery-item-service.js";
import { IngredientService } from "./ingredient-service.js";
import { PantryItemService } from "./pantry-item-service.js";

export type UpdatePantryInput = {
  removeExpired?: unknown;
};

export type UpdatePantryConfirmResult = {
  items: PantryItem[];
  maxPantryItems: number;
  report: ApplyReport;
};

export type UpdatePantryPreviewResult = {
  preview: ApplyReport;
};

function parseRemoveExpired(input: UpdatePantryInput): boolean {
  if (input.removeExpired === undefined) {
    return false;
  }
  if (typeof input.removeExpired !== "boolean") {
    throw validationError("removeExpired must be a boolean");
  }
  return input.removeExpired;
}

export class PantryManagerService {
  private readonly pantry: PantryItemService;
  private readonly grocery: GroceryItemService;
  private readonly ingredients: IngredientService;

  constructor(
    private readonly db: AppDatabase,
    private readonly householdId = DEFAULT_HOUSEHOLD_ID,
    deps?: {
      pantry?: PantryItemService;
      grocery?: GroceryItemService;
      ingredients?: IngredientService;
    },
  ) {
    this.pantry = deps?.pantry ?? new PantryItemService(db, householdId);
    this.grocery = deps?.grocery ?? new GroceryItemService(db, householdId);
    this.ingredients = deps?.ingredients ?? new IngredientService(db, householdId);
  }

  previewUpdatePantry(input: UpdatePantryInput = {}): UpdatePantryPreviewResult {
    const removeExpired = parseRemoveExpired(input);
    const plan = this.buildPlan(removeExpired, false);
    return { preview: plan.report };
  }

  confirmUpdatePantry(input: UpdatePantryInput = {}): UpdatePantryConfirmResult {
    const removeExpired = parseRemoveExpired(input);
    const plan = this.buildPlan(removeExpired, true);

    const now = new Date().toISOString();
    this.db.transaction((tx) => {
      if (plan.deletePantryIds.length > 0) {
        tx.delete(pantryItems)
          .where(
            and(
              eq(pantryItems.householdId, this.householdId),
              inArray(pantryItems.id, plan.deletePantryIds),
            ),
          )
          .run();
      }

      for (const create of plan.creates) {
        tx.insert(pantryItems)
          .values({
            id: randomUUID(),
            householdId: this.householdId,
            ingredientId: create.ingredientId,
            quantity: create.quantity,
            unitId: create.unitId,
            expirationDate: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      for (const upd of plan.updates) {
        tx.update(pantryItems)
          .set({
            quantity: upd.quantity,
            unitId: upd.unitId,
            expirationDate: upd.expirationDate,
            updatedAt: now,
          })
          .where(
            and(
              eq(pantryItems.id, upd.pantryItemId),
              eq(pantryItems.householdId, this.householdId),
            ),
          )
          .run();
      }

      if (plan.deleteGroceryIds.length > 0) {
        tx.delete(groceryItems)
          .where(
            and(
              eq(groceryItems.householdId, this.householdId),
              inArray(groceryItems.id, plan.deleteGroceryIds),
            ),
          )
          .run();
      }
    });

    const listed = this.pantry.listPantryItems();
    return {
      items: listed.items,
      maxPantryItems: MAX_PANTRY_ITEMS_PER_HOUSEHOLD,
      report: plan.report,
    };
  }

  private buildPlan(removeExpired: boolean, requireChecked: boolean) {
    const { items: pantryList } = this.pantry.listPantryItems();
    const { groups } = this.grocery.listGroceryItems();
    const allGrocery = groups.flatMap((g) => g.items);
    const checked = allGrocery.filter((g) => g.checked);

    const catalog = this.ingredients.listIngredients().items;
    const ingredientsById = new Map<string, PantryManagerIngredient>();
    for (const ing of catalog) {
      ingredientsById.set(ing.id, {
        id: ing.id,
        displayName: ing.displayName,
        defaultUnitId: ing.defaultUnitId,
      });
    }

    // Include display names for expired pantry ingredients even if somehow missing from list
    for (const row of pantryList) {
      if (!ingredientsById.has(row.ingredientId)) {
        ingredientsById.set(row.ingredientId, {
          id: row.ingredientId,
          displayName: row.ingredientDisplayName,
          defaultUnitId: row.unitId,
        });
      }
    }

    const pantryRows: PantryManagerPantryRow[] = pantryList.map((p) => ({
      id: p.id,
      ingredientId: p.ingredientId,
      quantity: p.quantity,
      unitId: p.unitId,
      expirationDate: p.expirationDate,
    }));

    const checkedGroceries: PantryManagerGroceryLine[] = checked.map((g) => ({
      id: g.id,
      ingredientId: g.ingredientId,
      quantity: g.quantity,
      unitId: g.unitId,
      checked: g.checked,
    }));

    return projectUpdatePantry({
      removeExpired,
      checkedGroceries,
      pantryRows,
      ingredientsById,
      requireChecked,
    });
  }
}
