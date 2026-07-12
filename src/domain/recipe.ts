import { isKnownDietaryRestriction } from "./dietary-restrictions.js";
import {
  recipeLimitError,
  unknownRestrictionError,
  unknownUnitError,
  validationError,
} from "./errors.js";
import { isKnownIngredientUnit } from "./ingredient-units.js";
import { collapseLabels, collapseRestrictionIds } from "./preference-profile.js";
import { roundQuantity } from "./quantity.js";

export type RecipeSource = "curated" | "ai";

export type IngredientLine = {
  name: string;
  quantity: number;
  unitId: string;
};

export type RecipeInput = {
  title: string;
  ingredients: IngredientLine[];
  instructionSteps: string[];
  servings?: number | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  cuisineTags?: string[];
  dietaryAttributeIds?: string[];
  source?: RecipeSource;
};

export type Recipe = {
  id: string;
  title: string;
  ingredients: IngredientLine[];
  instructionSteps: string[];
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  cuisineTags: string[];
  dietaryAttributeIds: string[];
  source: RecipeSource;
  createdAt: string;
  updatedAt: string;
};

export type RecipeSummary = {
  id: string;
  title: string;
  source: RecipeSource;
  servings: number | null;
  updatedAt: string;
};

export const MAX_TITLE_LENGTH = 120;
export const MAX_INGREDIENT_NAME_LENGTH = 80;
export const MAX_INGREDIENTS = 60;
export const MAX_INSTRUCTION_STEPS = 40;
export const MAX_STEP_LENGTH = 2000;
export const MAX_CUISINE_TAG_LENGTH = 40;
export const MAX_CUISINE_TAGS = 20;
export const MAX_RECIPES_PER_HOUSEHOLD = 500;
export { QUANTITY_DECIMAL_PLACES } from "./quantity.js";

function normalizeOptionalInt(
  value: number | null | undefined,
  field: string,
  { allowZero }: { allowZero: boolean },
): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw validationError(`${field} must be an integer`);
  }
  if (allowZero) {
    if (value < 0) throw validationError(`${field} must be >= 0`);
  } else if (value < 1) {
    throw validationError(`${field} must be a positive integer`);
  }
  return value;
}

export type NormalizedRecipeFields = {
  title: string;
  ingredients: IngredientLine[];
  instructionSteps: string[];
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  cuisineTags: string[];
  dietaryAttributeIds: string[];
  source: "curated";
};

/** Normalize and validate recipe create/replace input. Always forces source=curated. */
export function normalizeRecipeInput(input: RecipeInput): NormalizedRecipeFields {
  const title = input.title.trim();
  if (!title) {
    throw validationError("Title is required");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw recipeLimitError(`Title must be at most ${MAX_TITLE_LENGTH} characters`);
  }

  if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    throw validationError("At least one ingredient is required");
  }
  if (input.ingredients.length > MAX_INGREDIENTS) {
    throw recipeLimitError(`At most ${MAX_INGREDIENTS} ingredients are allowed`);
  }

  const ingredients: IngredientLine[] = [];
  for (const raw of input.ingredients) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) {
      throw validationError("Ingredient name is required");
    }
    if (name.length > MAX_INGREDIENT_NAME_LENGTH) {
      throw recipeLimitError(
        `Ingredient names must be at most ${MAX_INGREDIENT_NAME_LENGTH} characters`,
      );
    }
    const quantity = raw.quantity;
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
      throw validationError("Ingredient quantity must be a positive number");
    }
    const unitId = typeof raw.unitId === "string" ? raw.unitId : "";
    if (!isKnownIngredientUnit(unitId)) {
      throw unknownUnitError(unitId || "(missing)");
    }
    ingredients.push({
      name,
      quantity: roundQuantity(quantity),
      unitId,
    });
  }

  if (!Array.isArray(input.instructionSteps) || input.instructionSteps.length === 0) {
    throw validationError("At least one instruction step is required");
  }
  if (input.instructionSteps.length > MAX_INSTRUCTION_STEPS) {
    throw recipeLimitError(`At most ${MAX_INSTRUCTION_STEPS} instruction steps are allowed`);
  }

  const instructionSteps: string[] = [];
  for (const raw of input.instructionSteps) {
    const step = typeof raw === "string" ? raw.trim() : "";
    if (!step) {
      throw validationError("Instruction steps cannot be blank");
    }
    if (step.length > MAX_STEP_LENGTH) {
      throw recipeLimitError(`Instruction steps must be at most ${MAX_STEP_LENGTH} characters`);
    }
    instructionSteps.push(step);
  }

  const cuisineTags = collapseLabels(input.cuisineTags ?? []);
  for (const tag of cuisineTags) {
    if (tag.length > MAX_CUISINE_TAG_LENGTH) {
      throw recipeLimitError(
        `Cuisine tags must be at most ${MAX_CUISINE_TAG_LENGTH} characters`,
      );
    }
  }
  if (cuisineTags.length > MAX_CUISINE_TAGS) {
    throw recipeLimitError(`At most ${MAX_CUISINE_TAGS} cuisine tags are allowed`);
  }

  const dietaryAttributeIds = collapseRestrictionIds(input.dietaryAttributeIds ?? []);
  for (const id of dietaryAttributeIds) {
    if (!isKnownDietaryRestriction(id)) {
      throw unknownRestrictionError(id);
    }
  }

  return {
    title,
    ingredients,
    instructionSteps,
    servings: normalizeOptionalInt(input.servings, "servings", { allowZero: false }),
    prepTimeMinutes: normalizeOptionalInt(input.prepTimeMinutes, "prepTimeMinutes", {
      allowZero: true,
    }),
    cookTimeMinutes: normalizeOptionalInt(input.cookTimeMinutes, "cookTimeMinutes", {
      allowZero: true,
    }),
    cuisineTags,
    dietaryAttributeIds,
    source: "curated",
  };
}
