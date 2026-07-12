import { and, count, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DEFAULT_HOUSEHOLD_ID, type AppDatabase } from "../db/client.js";
import { groceryItems, ingredients } from "../db/schema.js";
import {
  groceryIngredientConflictError,
  groceryListFullError,
  ingredientInUseError,
  notFoundError,
} from "../domain/errors.js";
import {
  effectiveShoppingCategory,
  groupGroceryItems,
  MAX_GROCERY_ITEMS_PER_HOUSEHOLD,
  normalizeGroceryItemCreateInput,
  normalizeGroceryItemReplaceInput,
  normalizeSetCheckedInput,
  type GroceryCategoryGroup,
  type GroceryItem,
  type GroceryItemCreateInput,
  type GroceryItemReplaceInput,
} from "../domain/grocery-item.js";

function nowIso(): string {
  return new Date().toISOString();
}

function groceryFromRow(
  row: {
    id: string;
    householdId: string;
    ingredientId: string;
    quantity: number;
    unitId: string;
    checked: boolean;
    createdAt: string;
    updatedAt: string;
    ingredientDisplayName: string;
    shoppingCategoryId: string | null;
  },
): GroceryItem {
  const category = effectiveShoppingCategory(row.shoppingCategoryId);
  return {
    id: row.id,
    householdId: row.householdId,
    ingredientId: row.ingredientId,
    ingredientDisplayName: row.ingredientDisplayName,
    shoppingCategoryId: category.id,
    shoppingCategoryLabel: category.label,
    quantity: row.quantity,
    unitId: row.unitId,
    checked: Boolean(row.checked),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class GroceryItemService {
  constructor(
    private readonly db: AppDatabase,
    private readonly householdId = DEFAULT_HOUSEHOLD_ID,
  ) {}

  listGroceryItems(): { groups: GroceryCategoryGroup[]; maxGroceryItems: number } {
    const rows = this.db
      .select({
        id: groceryItems.id,
        householdId: groceryItems.householdId,
        ingredientId: groceryItems.ingredientId,
        quantity: groceryItems.quantity,
        unitId: groceryItems.unitId,
        checked: groceryItems.checked,
        createdAt: groceryItems.createdAt,
        updatedAt: groceryItems.updatedAt,
        ingredientDisplayName: ingredients.displayName,
        shoppingCategoryId: ingredients.shoppingCategoryId,
      })
      .from(groceryItems)
      .innerJoin(ingredients, eq(groceryItems.ingredientId, ingredients.id))
      .where(eq(groceryItems.householdId, this.householdId))
      .all();

    const items = rows.map((row) => groceryFromRow(row));
    return {
      groups: groupGroceryItems(items),
      maxGroceryItems: MAX_GROCERY_ITEMS_PER_HOUSEHOLD,
    };
  }

  getGroceryItem(groceryItemId: string): GroceryItem {
    const row = this.selectJoined(groceryItemId);
    if (!row) {
      throw notFoundError("Grocery item not found");
    }
    return groceryFromRow(row);
  }

  createGroceryItem(input: GroceryItemCreateInput & { checked?: unknown }): GroceryItem {
    const ingredient = this.loadIngredient(input.ingredientId);
    const fields = normalizeGroceryItemCreateInput(input, ingredient.defaultUnitId);
    this.assertListCapacity();
    this.assertIngredientAvailable(input.ingredientId);

    const id = randomUUID();
    const now = nowIso();
    this.db
      .insert(groceryItems)
      .values({
        id,
        householdId: this.householdId,
        ingredientId: input.ingredientId,
        quantity: fields.quantity,
        unitId: fields.unitId,
        checked: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return this.getGroceryItem(id);
  }

  replaceGroceryItem(
    groceryItemId: string,
    input: GroceryItemReplaceInput & { checked?: unknown; ingredientId?: unknown },
  ): GroceryItem {
    const existing = this.db
      .select({
        id: groceryItems.id,
        ingredientId: groceryItems.ingredientId,
      })
      .from(groceryItems)
      .where(and(eq(groceryItems.id, groceryItemId), eq(groceryItems.householdId, this.householdId)))
      .get();
    if (!existing) {
      throw notFoundError("Grocery item not found");
    }

    const ingredient = this.loadIngredient(existing.ingredientId);
    const fields = normalizeGroceryItemReplaceInput(input, ingredient.defaultUnitId);

    const now = nowIso();
    this.db
      .update(groceryItems)
      .set({
        quantity: fields.quantity,
        unitId: fields.unitId,
        updatedAt: now,
      })
      .where(and(eq(groceryItems.id, groceryItemId), eq(groceryItems.householdId, this.householdId)))
      .run();

    return this.getGroceryItem(groceryItemId);
  }

  setGroceryItemChecked(
    groceryItemId: string,
    input: { checked?: unknown },
  ): GroceryItem {
    const existing = this.db
      .select({ id: groceryItems.id })
      .from(groceryItems)
      .where(and(eq(groceryItems.id, groceryItemId), eq(groceryItems.householdId, this.householdId)))
      .get();
    if (!existing) {
      throw notFoundError("Grocery item not found");
    }

    const checked = normalizeSetCheckedInput(input);
    const now = nowIso();
    this.db
      .update(groceryItems)
      .set({
        checked,
        updatedAt: now,
      })
      .where(and(eq(groceryItems.id, groceryItemId), eq(groceryItems.householdId, this.householdId)))
      .run();

    return this.getGroceryItem(groceryItemId);
  }

  deleteGroceryItem(groceryItemId: string): void {
    const existing = this.db
      .select({ id: groceryItems.id })
      .from(groceryItems)
      .where(and(eq(groceryItems.id, groceryItemId), eq(groceryItems.householdId, this.householdId)))
      .get();
    if (!existing) {
      throw notFoundError("Grocery item not found");
    }
    this.db
      .delete(groceryItems)
      .where(and(eq(groceryItems.id, groceryItemId), eq(groceryItems.householdId, this.householdId)))
      .run();
  }

  /**
   * Apply GroceryListBuilder sync ops in one transaction.
   * Caller MUST preflight projected count ≤ MAX; this method does not re-check cap mid-flight
   * beyond asserting projectedCount ≤ max before writing.
   */
  applyBuilderSync(ops: {
    creates: { ingredientId: string; quantity: number; unitId: string }[];
    updates: { groceryItemId: string; quantity: number; unitId: string }[];
    deletes: { groceryItemId: string }[];
    projectedCount: number;
  }): void {
    if (ops.projectedCount > MAX_GROCERY_ITEMS_PER_HOUSEHOLD) {
      throw groceryListFullError();
    }

    const now = nowIso();
    this.db.transaction((tx) => {
      for (const del of ops.deletes) {
        tx.delete(groceryItems)
          .where(
            and(
              eq(groceryItems.id, del.groceryItemId),
              eq(groceryItems.householdId, this.householdId),
            ),
          )
          .run();
      }
      for (const upd of ops.updates) {
        tx.update(groceryItems)
          .set({
            quantity: upd.quantity,
            unitId: upd.unitId,
            updatedAt: now,
          })
          .where(
            and(
              eq(groceryItems.id, upd.groceryItemId),
              eq(groceryItems.householdId, this.householdId),
            ),
          )
          .run();
      }
      for (const create of ops.creates) {
        tx.insert(groceryItems)
          .values({
            id: randomUUID(),
            householdId: this.householdId,
            ingredientId: create.ingredientId,
            quantity: create.quantity,
            unitId: create.unitId,
            checked: false,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    });
  }

  private selectJoined(groceryItemId: string) {
    return this.db
      .select({
        id: groceryItems.id,
        householdId: groceryItems.householdId,
        ingredientId: groceryItems.ingredientId,
        quantity: groceryItems.quantity,
        unitId: groceryItems.unitId,
        checked: groceryItems.checked,
        createdAt: groceryItems.createdAt,
        updatedAt: groceryItems.updatedAt,
        ingredientDisplayName: ingredients.displayName,
        shoppingCategoryId: ingredients.shoppingCategoryId,
      })
      .from(groceryItems)
      .innerJoin(ingredients, eq(groceryItems.ingredientId, ingredients.id))
      .where(and(eq(groceryItems.id, groceryItemId), eq(groceryItems.householdId, this.householdId)))
      .get();
  }

  private loadIngredient(ingredientId: string): {
    defaultUnitId: string;
    displayName: string;
    shoppingCategoryId: string | null;
  } {
    const row = this.db
      .select({
        defaultUnitId: ingredients.defaultUnitId,
        displayName: ingredients.displayName,
        shoppingCategoryId: ingredients.shoppingCategoryId,
      })
      .from(ingredients)
      .where(and(eq(ingredients.id, ingredientId), eq(ingredients.householdId, this.householdId)))
      .get();
    if (!row) {
      throw notFoundError("Ingredient not found");
    }
    return row;
  }

  private assertListCapacity(): void {
    const existing = this.db
      .select({ value: count() })
      .from(groceryItems)
      .where(eq(groceryItems.householdId, this.householdId))
      .get();
    if ((existing?.value ?? 0) >= MAX_GROCERY_ITEMS_PER_HOUSEHOLD) {
      throw groceryListFullError();
    }
  }

  private assertIngredientAvailable(ingredientId: string): void {
    const existing = this.db
      .select({ id: groceryItems.id })
      .from(groceryItems)
      .where(
        and(
          eq(groceryItems.householdId, this.householdId),
          eq(groceryItems.ingredientId, ingredientId),
        ),
      )
      .get();
    if (existing) {
      throw groceryIngredientConflictError();
    }
  }
}

/** Used by IngredientService to block delete while on grocery list. */
export function assertIngredientNotInGrocery(
  db: AppDatabase,
  householdId: string,
  ingredientId: string,
): void {
  const listed = db
    .select({ id: groceryItems.id })
    .from(groceryItems)
    .where(
      and(eq(groceryItems.householdId, householdId), eq(groceryItems.ingredientId, ingredientId)),
    )
    .get();
  if (listed) {
    throw ingredientInUseError(
      "Ingredient is referenced by a grocery list line; remove the grocery item first",
    );
  }
}
