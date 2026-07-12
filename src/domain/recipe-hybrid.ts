/**
 * RecipeHybridEngine — Speckit feature `012-recipe-hybrid-engine`.
 *
 * Constitution service name: RecipeHybridEngine.
 * Internal-only: AI generate / hybrid fill / substitute + preference-safe
 * library acceptance. No new HTTP surface; GenerateWeeklyMeals is not auto-wired.
 *
 * Pure validation / retry / substitution / soft-guidance helpers. Persistence
 * and generator I/O live in RecipeHybridService.
 */
import {
  hybridReplaceCuratedForbiddenError,
  validationError,
} from "./errors.js";
import {
  aggregatePreferences,
  isRecipeHardSafe,
  normalizeMatchText,
  toCandidateRecipe,
  type HouseholdPreferenceAggregate,
} from "./meal-suggestion.js";
import type { PreferenceProfile } from "./preference-profile.js";
import {
  normalizeAiRecipeInput,
  type IngredientLine,
  type Recipe,
  type RecipeInput,
} from "./recipe.js";

export const MAX_GENERATION_ATTEMPTS_PER_SLOT = 3;

export const HYBRID_FAILURE_REASONS = [
  "HYBRID_GENERATION_FAILED",
  "RECIPE_LIBRARY_FULL",
  "NO_SAFE_CANDIDATE_AFTER_RETRIES",
] as const;

export type HybridFailureReason = (typeof HYBRID_FAILURE_REASONS)[number];

export type RecipeAiCandidate = {
  title: string;
  ingredients: IngredientLine[];
  instructionSteps: string[];
  servings?: number | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  cuisineTags?: string[];
  dietaryAttributeIds?: string[];
};

export type RecipeAiGenerator = {
  generate(request: {
    attempt: number;
    seasonalGuidance?: string;
    budgetGuidance?: string;
    excludeRecipeIds?: string[];
  }): Promise<RecipeAiCandidate> | RecipeAiCandidate;
};

export type HybridGenerationRequest = {
  count?: number;
  seasonalGuidance?: string;
  budgetGuidance?: string;
  excludeRecipeIds?: string[];
};

export type HybridGenerationResult = {
  accepted: Recipe[];
  requestedCount: number;
  acceptedCount: number;
  unmetCount: number;
  failures: Array<{ reason: HybridFailureReason }>;
};

export type SubstitutionMode = "distinct" | "replace-in-place";

export type SubstitutionRequest = {
  recipeId: string;
  ingredientName: string;
  replacement: IngredientLine;
  mode?: SubstitutionMode;
  seasonalGuidance?: string;
  budgetGuidance?: string;
};

export type SubstitutionResult = {
  recipe: Recipe;
  modeApplied: SubstitutionMode;
};

export function prefsFromProfiles(profiles: PreferenceProfile[]): HouseholdPreferenceAggregate {
  return aggregatePreferences(profiles);
}

export function applySoftGuidanceTags(
  cuisineTags: string[] | undefined,
  seasonalGuidance?: string,
  budgetGuidance?: string,
): string[] {
  const tags = [...(cuisineTags ?? [])];
  const push = (raw?: string) => {
    if (!raw) return;
    const t = raw.trim();
    if (!t) return;
    tags.push(t);
  };
  push(seasonalGuidance);
  push(budgetGuidance);
  return tags;
}

export function candidateInputFromAi(
  candidate: RecipeAiCandidate,
  seasonalGuidance?: string,
  budgetGuidance?: string,
): RecipeInput {
  return {
    title: candidate.title,
    ingredients: candidate.ingredients,
    instructionSteps: candidate.instructionSteps,
    servings: candidate.servings,
    prepTimeMinutes: candidate.prepTimeMinutes,
    cookTimeMinutes: candidate.cookTimeMinutes,
    cuisineTags: applySoftGuidanceTags(
      candidate.cuisineTags,
      seasonalGuidance,
      budgetGuidance,
    ),
    dietaryAttributeIds: candidate.dietaryAttributeIds,
    source: "ai",
  };
}

/**
 * Schema + preference gate for an AI candidate. Throws DomainError on schema
 * failure; returns false on preference failure (caller may retry).
 */
export function tryAcceptAiCandidate(
  candidate: RecipeAiCandidate,
  prefs: HouseholdPreferenceAggregate,
  seasonalGuidance?: string,
  budgetGuidance?: string,
): { ok: true; fields: ReturnType<typeof normalizeAiRecipeInput> } | { ok: false; kind: "preference" } {
  const input = candidateInputFromAi(candidate, seasonalGuidance, budgetGuidance);
  const fields = normalizeAiRecipeInput(input);
  const provisional: Recipe = {
    id: "pending",
    ...fields,
    createdAt: "",
    updatedAt: "",
  };
  if (!isRecipeHardSafe(toCandidateRecipe(provisional), prefs)) {
    return { ok: false, kind: "preference" };
  }
  return { ok: true, fields };
}

/** Deterministic validation outcome for identical candidate + prefs. */
export function validateAiCandidateDeterministic(
  candidate: RecipeAiCandidate,
  prefs: HouseholdPreferenceAggregate,
  seasonalGuidance?: string,
  budgetGuidance?: string,
): "accept" | "preference_reject" | "schema_reject" {
  try {
    const result = tryAcceptAiCandidate(candidate, prefs, seasonalGuidance, budgetGuidance);
    return result.ok ? "accept" : "preference_reject";
  } catch {
    return "schema_reject";
  }
}

export function assertStructuredReplacement(replacement: unknown): IngredientLine {
  if (!replacement || typeof replacement !== "object") {
    throw validationError("replacement is required");
  }
  const r = replacement as Partial<IngredientLine>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) throw validationError("replacement.name is required");
  if (typeof r.quantity !== "number" || !Number.isFinite(r.quantity) || r.quantity <= 0) {
    throw validationError("replacement.quantity must be a positive number");
  }
  if (typeof r.unitId !== "string" || !r.unitId) {
    throw validationError("replacement.unitId is required");
  }
  return { name, quantity: r.quantity, unitId: r.unitId };
}

export function findIngredientIndex(recipe: Recipe, ingredientName: string): number {
  const key = normalizeMatchText(ingredientName);
  if (!key) throw validationError("ingredientName is required");
  return recipe.ingredients.findIndex((i) => normalizeMatchText(i.name) === key);
}

export function buildSubstitutedRecipeInput(
  recipe: Recipe,
  ingredientName: string,
  replacement: IngredientLine,
  seasonalGuidance?: string,
  budgetGuidance?: string,
): RecipeInput {
  const idx = findIngredientIndex(recipe, ingredientName);
  if (idx < 0) {
    throw validationError(`Ingredient not found on recipe: ${ingredientName}`);
  }
  const ingredients = recipe.ingredients.map((line, i) =>
    i === idx ? { ...replacement } : { ...line },
  );
  return {
    title: recipe.title,
    ingredients,
    instructionSteps: [...recipe.instructionSteps],
    servings: recipe.servings,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    cuisineTags: applySoftGuidanceTags(recipe.cuisineTags, seasonalGuidance, budgetGuidance),
    dietaryAttributeIds: [...recipe.dietaryAttributeIds],
    source: "ai",
  };
}

export function assertSubstitutionModeAllowed(
  recipe: Recipe,
  mode: SubstitutionMode,
): void {
  if (mode === "replace-in-place" && recipe.source !== "ai") {
    throw hybridReplaceCuratedForbiddenError();
  }
}

export function emptyHybridResult(requestedCount: number): HybridGenerationResult {
  return {
    accepted: [],
    requestedCount,
    acceptedCount: 0,
    unmetCount: requestedCount,
    failures: [],
  };
}

export function finalizeHybridResult(
  accepted: Recipe[],
  requestedCount: number,
  failures: Array<{ reason: HybridFailureReason }>,
): HybridGenerationResult {
  return {
    accepted,
    requestedCount,
    acceptedCount: accepted.length,
    unmetCount: Math.max(0, requestedCount - accepted.length),
    failures,
  };
}
