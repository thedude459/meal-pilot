import { and, count, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DEFAULT_HOUSEHOLD_ID, type AppDatabase } from "../db/client.js";
import { ingredients, pantryItems } from "../db/schema.js";
import {
  ingredientInUseError,
  notFoundError,
  pantryIngredientConflictError,
  pantryInventoryFullError,
  validationError,
} from "../domain/errors.js";
import {
  MAX_PANTRY_ITEMS_PER_HOUSEHOLD,
  normalizePantryItemInput,
  normalizePantryItemReplaceInput,
  type PantryItem,
  type PantryItemCreateInput,
  type PantryItemReplaceInput,
} from "../domain/pantry-item.js";

function nowIso(): string {
  return new Date().toISOString();
}

function pantryFromRow(
  row: {
    id: string;
    householdId: string;
    ingredientId: string;
    quantity: number;
    unitId: string;
    expirationDate: string | null;
    createdAt: string;
    updatedAt: string;
  },
  ingredientDisplayName: string,
): PantryItem {
  return {
    id: row.id,
    householdId: row.householdId,
    ingredientId: row.ingredientId,
    ingredientDisplayName,
    quantity: row.quantity,
    unitId: row.unitId,
    expirationDate: row.expirationDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PantryItemService {
  constructor(
    private readonly db: AppDatabase,
    private readonly householdId = DEFAULT_HOUSEHOLD_ID,
  ) {}

  listPantryItems(): { items: PantryItem[]; maxPantryItems: number } {
    const rows = this.db
      .select({
        id: pantryItems.id,
        householdId: pantryItems.householdId,
        ingredientId: pantryItems.ingredientId,
        quantity: pantryItems.quantity,
        unitId: pantryItems.unitId,
        expirationDate: pantryItems.expirationDate,
        createdAt: pantryItems.createdAt,
        updatedAt: pantryItems.updatedAt,
        ingredientDisplayName: ingredients.displayName,
      })
      .from(pantryItems)
      .innerJoin(ingredients, eq(pantryItems.ingredientId, ingredients.id))
      .where(eq(pantryItems.householdId, this.householdId))
      .all();

    const items = rows
      .map((row) =>
        pantryFromRow(row, row.ingredientDisplayName),
      )
      .sort((a, b) =>
        a.ingredientDisplayName.localeCompare(b.ingredientDisplayName, "en", {
          sensitivity: "base",
        }),
      );

    return { items, maxPantryItems: MAX_PANTRY_ITEMS_PER_HOUSEHOLD };
  }

  getPantryItem(pantryItemId: string): PantryItem {
    const row = this.db
      .select({
        id: pantryItems.id,
        householdId: pantryItems.householdId,
        ingredientId: pantryItems.ingredientId,
        quantity: pantryItems.quantity,
        unitId: pantryItems.unitId,
        expirationDate: pantryItems.expirationDate,
        createdAt: pantryItems.createdAt,
        updatedAt: pantryItems.updatedAt,
        ingredientDisplayName: ingredients.displayName,
      })
      .from(pantryItems)
      .innerJoin(ingredients, eq(pantryItems.ingredientId, ingredients.id))
      .where(and(eq(pantryItems.id, pantryItemId), eq(pantryItems.householdId, this.householdId)))
      .get();
    if (!row) {
      throw notFoundError("Pantry item not found");
    }
    return pantryFromRow(row, row.ingredientDisplayName);
  }

  createPantryItem(input: PantryItemCreateInput): PantryItem {
    const ingredient = this.loadIngredient(input.ingredientId);
    const fields = normalizePantryItemInput(input, ingredient.defaultUnitId);
    this.assertInventoryCapacity();
    this.assertIngredientAvailable(input.ingredientId);

    const id = randomUUID();
    const now = nowIso();
    this.db
      .insert(pantryItems)
      .values({
        id,
        householdId: this.householdId,
        ingredientId: input.ingredientId,
        quantity: fields.quantity,
        unitId: fields.unitId,
        expirationDate: fields.expirationDate,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return this.getPantryItem(id);
  }

  replacePantryItem(pantryItemId: string, input: PantryItemReplaceInput & { ingredientId?: unknown }): PantryItem {
    if ("ingredientId" in input && input.ingredientId !== undefined) {
      throw validationError("ingredientId cannot be changed on replace");
    }

    const existing = this.db
      .select({
        id: pantryItems.id,
        ingredientId: pantryItems.ingredientId,
      })
      .from(pantryItems)
      .where(and(eq(pantryItems.id, pantryItemId), eq(pantryItems.householdId, this.householdId)))
      .get();
    if (!existing) {
      throw notFoundError("Pantry item not found");
    }

    const ingredient = this.loadIngredient(existing.ingredientId);
    const fields = normalizePantryItemReplaceInput(input, ingredient.defaultUnitId);

    const now = nowIso();
    this.db
      .update(pantryItems)
      .set({
        quantity: fields.quantity,
        unitId: fields.unitId,
        expirationDate: fields.expirationDate,
        updatedAt: now,
      })
      .where(and(eq(pantryItems.id, pantryItemId), eq(pantryItems.householdId, this.householdId)))
      .run();

    return this.getPantryItem(pantryItemId);
  }

  deletePantryItem(pantryItemId: string): void {
    const existing = this.db
      .select({ id: pantryItems.id })
      .from(pantryItems)
      .where(and(eq(pantryItems.id, pantryItemId), eq(pantryItems.householdId, this.householdId)))
      .get();
    if (!existing) {
      throw notFoundError("Pantry item not found");
    }
    this.db
      .delete(pantryItems)
      .where(and(eq(pantryItems.id, pantryItemId), eq(pantryItems.householdId, this.householdId)))
      .run();
  }

  private loadIngredient(ingredientId: string): { defaultUnitId: string; displayName: string } {
    const row = this.db
      .select({
        defaultUnitId: ingredients.defaultUnitId,
        displayName: ingredients.displayName,
      })
      .from(ingredients)
      .where(and(eq(ingredients.id, ingredientId), eq(ingredients.householdId, this.householdId)))
      .get();
    if (!row) {
      throw notFoundError("Ingredient not found");
    }
    return row;
  }

  private assertInventoryCapacity(): void {
    const existing = this.db
      .select({ value: count() })
      .from(pantryItems)
      .where(eq(pantryItems.householdId, this.householdId))
      .get();
    if ((existing?.value ?? 0) >= MAX_PANTRY_ITEMS_PER_HOUSEHOLD) {
      throw pantryInventoryFullError();
    }
  }

  private assertIngredientAvailable(ingredientId: string): void {
    const existing = this.db
      .select({ id: pantryItems.id })
      .from(pantryItems)
      .where(
        and(eq(pantryItems.householdId, this.householdId), eq(pantryItems.ingredientId, ingredientId)),
      )
      .get();
    if (existing) {
      throw pantryIngredientConflictError();
    }
  }
}

/** Used by IngredientService to block delete while stocked. */
export function assertIngredientNotInPantry(
  db: AppDatabase,
  householdId: string,
  ingredientId: string,
): void {
  const stocked = db
    .select({ id: pantryItems.id })
    .from(pantryItems)
    .where(and(eq(pantryItems.householdId, householdId), eq(pantryItems.ingredientId, ingredientId)))
    .get();
  if (stocked) {
    throw ingredientInUseError();
  }
}
