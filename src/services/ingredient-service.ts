import { and, count, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DEFAULT_HOUSEHOLD_ID, type AppDatabase } from "../db/client.js";
import { ingredients } from "../db/schema.js";
import {
  assertNoLabelOverlap,
  ingredientLabelKeys,
  MAX_INGREDIENTS_PER_HOUSEHOLD,
  normalizeIngredientInput,
  normalizeIngredientReplaceInput,
  labelKey,
  type Ingredient,
  type IngredientInput,
  type IngredientReplaceInput,
  type NormalizedIngredientFields,
} from "../domain/ingredient.js";
import { ingredientCatalogFullError, notFoundError } from "../domain/errors.js";
import { assertIngredientNotInGrocery } from "./grocery-item-service.js";
import { assertIngredientNotInPantry } from "./pantry-item-service.js";

function nowIso(): string {
  return new Date().toISOString();
}

function parseAliases(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function ingredientFromRow(row: {
  id: string;
  householdId: string;
  displayName: string;
  defaultUnitId: string;
  shoppingCategoryId: string | null;
  aliasesJson: string;
  createdAt: string;
  updatedAt: string;
}): Ingredient {
  return {
    id: row.id,
    householdId: row.householdId,
    displayName: row.displayName,
    defaultUnitId: row.defaultUnitId,
    shoppingCategoryId: row.shoppingCategoryId,
    aliases: parseAliases(row.aliasesJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class IngredientService {
  constructor(
    private readonly db: AppDatabase,
    private readonly householdId = DEFAULT_HOUSEHOLD_ID,
  ) {}

  listIngredients(): { items: Ingredient[]; maxIngredients: number } {
    const rows = this.db
      .select()
      .from(ingredients)
      .where(eq(ingredients.householdId, this.householdId))
      .all();

    const items = rows
      .map(ingredientFromRow)
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }),
      );

    return { items, maxIngredients: MAX_INGREDIENTS_PER_HOUSEHOLD };
  }

  getIngredient(ingredientId: string): Ingredient {
    const row = this.db
      .select()
      .from(ingredients)
      .where(and(eq(ingredients.id, ingredientId), eq(ingredients.householdId, this.householdId)))
      .get();
    if (!row) {
      throw notFoundError("Ingredient not found");
    }
    return ingredientFromRow(row);
  }

  createIngredient(input: IngredientInput): Ingredient {
    const fields = normalizeIngredientInput(input);
    this.assertCatalogCapacity();
    this.assertLabelsAvailable(fields);

    const id = randomUUID();
    const now = nowIso();
    this.db
      .insert(ingredients)
      .values({
        id,
        householdId: this.householdId,
        displayName: fields.displayName,
        displayNameKey: fields.displayNameKey,
        defaultUnitId: fields.defaultUnitId,
        shoppingCategoryId: fields.shoppingCategoryId,
        aliasesJson: JSON.stringify(fields.aliases),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return this.getIngredient(id);
  }

  replaceIngredient(ingredientId: string, input: IngredientReplaceInput): Ingredient {
    const existing = this.db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(and(eq(ingredients.id, ingredientId), eq(ingredients.householdId, this.householdId)))
      .get();
    if (!existing) {
      throw notFoundError("Ingredient not found");
    }

    const fields = normalizeIngredientReplaceInput(input);
    this.assertLabelsAvailable(fields, ingredientId);

    const now = nowIso();
    this.db
      .update(ingredients)
      .set({
        displayName: fields.displayName,
        displayNameKey: fields.displayNameKey,
        defaultUnitId: fields.defaultUnitId,
        shoppingCategoryId: fields.shoppingCategoryId,
        aliasesJson: JSON.stringify(fields.aliases),
        updatedAt: now,
      })
      .where(and(eq(ingredients.id, ingredientId), eq(ingredients.householdId, this.householdId)))
      .run();

    return this.getIngredient(ingredientId);
  }

  deleteIngredient(ingredientId: string): void {
    const existing = this.db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(and(eq(ingredients.id, ingredientId), eq(ingredients.householdId, this.householdId)))
      .get();
    if (!existing) {
      throw notFoundError("Ingredient not found");
    }
    assertIngredientNotInPantry(this.db, this.householdId, ingredientId);
    assertIngredientNotInGrocery(this.db, this.householdId, ingredientId);
    this.db
      .delete(ingredients)
      .where(and(eq(ingredients.id, ingredientId), eq(ingredients.householdId, this.householdId)))
      .run();
  }

  private assertCatalogCapacity(): void {
    const existing = this.db
      .select({ value: count() })
      .from(ingredients)
      .where(eq(ingredients.householdId, this.householdId))
      .get();
    if ((existing?.value ?? 0) >= MAX_INGREDIENTS_PER_HOUSEHOLD) {
      throw ingredientCatalogFullError();
    }
  }

  private assertLabelsAvailable(
    fields: NormalizedIngredientFields,
    excludeIngredientId?: string,
  ): void {
    const query = this.db
      .select({
        id: ingredients.id,
        displayName: ingredients.displayName,
        aliasesJson: ingredients.aliasesJson,
      })
      .from(ingredients)
      .where(
        excludeIngredientId
          ? and(
              eq(ingredients.householdId, this.householdId),
              ne(ingredients.id, excludeIngredientId),
            )
          : eq(ingredients.householdId, this.householdId),
      );

    const rows = query.all();
    const occupied = new Set<string>();
    for (const row of rows) {
      occupied.add(labelKey(row.displayName));
      for (const alias of parseAliases(row.aliasesJson)) {
        occupied.add(labelKey(alias));
      }
    }
    assertNoLabelOverlap(ingredientLabelKeys(fields), occupied);
  }
}
