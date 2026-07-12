import { and, count, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DEFAULT_HOUSEHOLD_ID, type AppDatabase } from "../db/client.js";
import { recipes } from "../db/schema.js";
import { notFoundError, recipeLibraryFullError } from "../domain/errors.js";
import {
  MAX_RECIPES_PER_HOUSEHOLD,
  normalizeRecipeInput,
  type IngredientLine,
  type Recipe,
  type RecipeInput,
  type RecipeSource,
  type RecipeSummary,
} from "../domain/recipe.js";

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

function recipeFromRow(row: {
  id: string;
  title: string;
  ingredientsJson: string;
  instructionStepsJson: string;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  cuisineTagsJson: string;
  dietaryAttributeIdsJson: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}): Recipe {
  return {
    id: row.id,
    title: row.title,
    ingredients: parseJsonArray<IngredientLine>(row.ingredientsJson),
    instructionSteps: parseJsonArray<string>(row.instructionStepsJson),
    servings: row.servings,
    prepTimeMinutes: row.prepTimeMinutes,
    cookTimeMinutes: row.cookTimeMinutes,
    cuisineTags: parseJsonArray<string>(row.cuisineTagsJson),
    dietaryAttributeIds: parseJsonArray<string>(row.dietaryAttributeIdsJson),
    source: row.source as RecipeSource,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class RecipeService {
  constructor(
    private readonly db: AppDatabase,
    private readonly householdId = DEFAULT_HOUSEHOLD_ID,
  ) {}

  listRecipes(): { items: RecipeSummary[]; maxRecipes: number } {
    const rows = this.db
      .select({
        id: recipes.id,
        title: recipes.title,
        source: recipes.source,
        servings: recipes.servings,
        updatedAt: recipes.updatedAt,
      })
      .from(recipes)
      .where(eq(recipes.householdId, this.householdId))
      .all();

    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        source: r.source as RecipeSource,
        servings: r.servings,
        updatedAt: r.updatedAt,
      })),
      maxRecipes: MAX_RECIPES_PER_HOUSEHOLD,
    };
  }

  getRecipe(recipeId: string): Recipe {
    const row = this.db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, this.householdId)))
      .get();
    if (!row) {
      throw notFoundError("Recipe not found");
    }
    return recipeFromRow(row);
  }

  createRecipe(input: RecipeInput): Recipe {
    const fields = normalizeRecipeInput(input);
    const existing = this.db
      .select({ value: count() })
      .from(recipes)
      .where(eq(recipes.householdId, this.householdId))
      .get();
    if ((existing?.value ?? 0) >= MAX_RECIPES_PER_HOUSEHOLD) {
      throw recipeLibraryFullError();
    }

    const id = randomUUID();
    const now = nowIso();
    this.db
      .insert(recipes)
      .values({
        id,
        householdId: this.householdId,
        title: fields.title,
        ingredientsJson: JSON.stringify(fields.ingredients),
        instructionStepsJson: JSON.stringify(fields.instructionSteps),
        servings: fields.servings,
        prepTimeMinutes: fields.prepTimeMinutes,
        cookTimeMinutes: fields.cookTimeMinutes,
        cuisineTagsJson: JSON.stringify(fields.cuisineTags),
        dietaryAttributeIdsJson: JSON.stringify(fields.dietaryAttributeIds),
        source: fields.source,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return this.getRecipe(id);
  }

  replaceRecipe(recipeId: string, input: RecipeInput): Recipe {
    const existing = this.db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, this.householdId)))
      .get();
    if (!existing) {
      throw notFoundError("Recipe not found");
    }

    const fields = normalizeRecipeInput(input);
    const now = nowIso();
    this.db
      .update(recipes)
      .set({
        title: fields.title,
        ingredientsJson: JSON.stringify(fields.ingredients),
        instructionStepsJson: JSON.stringify(fields.instructionSteps),
        servings: fields.servings,
        prepTimeMinutes: fields.prepTimeMinutes,
        cookTimeMinutes: fields.cookTimeMinutes,
        cuisineTagsJson: JSON.stringify(fields.cuisineTags),
        dietaryAttributeIdsJson: JSON.stringify(fields.dietaryAttributeIds),
        source: fields.source,
        updatedAt: now,
      })
      .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, this.householdId)))
      .run();

    return this.getRecipe(recipeId);
  }

  deleteRecipe(recipeId: string): void {
    const existing = this.db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, this.householdId)))
      .get();
    if (!existing) {
      throw notFoundError("Recipe not found");
    }
    this.db
      .delete(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, this.householdId)))
      .run();
  }
}
