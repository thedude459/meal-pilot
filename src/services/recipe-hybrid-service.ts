/**
 * RecipeHybridEngine facade — Speckit feature `012-recipe-hybrid-engine`.
 *
 * Internal service only (no organizer HTTP). Callers invoke generateRecipe /
 * hybridFill / substituteIngredient in-process. Does not change
 * GenerateWeeklyMeals orchestration.
 */
import { DomainError, ErrorCode } from "../domain/errors.js";
import {
  assertStructuredReplacement,
  assertSubstitutionModeAllowed,
  buildSubstitutedRecipeInput,
  emptyHybridResult,
  finalizeHybridResult,
  MAX_GENERATION_ATTEMPTS_PER_SLOT,
  prefsFromProfiles,
  tryAcceptAiCandidate,
  type HybridFailureReason,
  type HybridGenerationRequest,
  type HybridGenerationResult,
  type RecipeAiGenerator,
  type SubstitutionRequest,
  type SubstitutionResult,
} from "../domain/recipe-hybrid.js";
import type { PreferenceProfile } from "../domain/preference-profile.js";
import { DEFAULT_HOUSEHOLD_ID, type AppDatabase } from "../db/client.js";
import { FamilyMemberService } from "./family-member-service.js";
import { RecipeService } from "./recipe-service.js";

export type RecipeHybridServiceOptions = {
  generator: RecipeAiGenerator;
  householdId?: string;
};

export class RecipeHybridService {
  private readonly householdId: string;
  private readonly generator: RecipeAiGenerator;
  private readonly members: FamilyMemberService;
  private readonly recipes: RecipeService;

  constructor(db: AppDatabase, options: RecipeHybridServiceOptions) {
    this.householdId = options.householdId ?? DEFAULT_HOUSEHOLD_ID;
    this.generator = options.generator;
    this.members = new FamilyMemberService(db, this.householdId);
    this.recipes = new RecipeService(db, this.householdId);
  }

  async generateRecipe(
    request: Omit<HybridGenerationRequest, "count"> = {},
  ): Promise<HybridGenerationResult> {
    return this.hybridFill({ ...request, count: 1 });
  }

  async hybridFill(request: HybridGenerationRequest): Promise<HybridGenerationResult> {
    const count = request.count ?? 1;
    if (!Number.isInteger(count) || count < 1) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, "count must be a positive integer", 400);
    }

    const prefs = this.loadPrefs();
    const accepted = [];
    const failures: Array<{ reason: HybridFailureReason }> = [];

    for (let slot = 0; slot < count; slot++) {
      const slotResult = await this.generateOneSlot(prefs, request);
      if (slotResult.ok) {
        accepted.push(slotResult.recipe);
      } else {
        failures.push({ reason: slotResult.reason });
        if (slotResult.reason === "RECIPE_LIBRARY_FULL") {
          // Remaining slots cannot succeed either.
          while (failures.length + accepted.length < count) {
            failures.push({ reason: "RECIPE_LIBRARY_FULL" });
          }
          break;
        }
      }
    }

    return finalizeHybridResult(accepted, count, failures);
  }

  async substituteIngredient(request: SubstitutionRequest): Promise<SubstitutionResult> {
    const mode = request.mode ?? "distinct";
    const replacement = assertStructuredReplacement(request.replacement);
    const original = this.recipes.getRecipe(request.recipeId);
    assertSubstitutionModeAllowed(original, mode);

    const input = buildSubstitutedRecipeInput(
      original,
      request.ingredientName,
      replacement,
      request.seasonalGuidance,
      request.budgetGuidance,
    );

    const prefs = this.loadPrefs();
    const accept = tryAcceptAiCandidate(
      {
        title: input.title,
        ingredients: input.ingredients!,
        instructionSteps: input.instructionSteps!,
        servings: input.servings,
        prepTimeMinutes: input.prepTimeMinutes,
        cookTimeMinutes: input.cookTimeMinutes,
        cuisineTags: input.cuisineTags,
        dietaryAttributeIds: input.dietaryAttributeIds,
      },
      prefs,
    );
    if (!accept.ok) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        "Substituted recipe fails household preference validation",
        400,
      );
    }

    if (mode === "replace-in-place") {
      const recipe = this.recipes.updateAiRecipe(original.id, accept.fields);
      return { recipe, modeApplied: "replace-in-place" };
    }

    const recipe = this.recipes.createAiRecipe(accept.fields);
    return { recipe, modeApplied: "distinct" };
  }

  private loadPrefs() {
    const listed = this.members.listFamilyMembers();
    const profiles: PreferenceProfile[] = listed.items.map((m) =>
      this.members.getPreferences(m.id),
    );
    return prefsFromProfiles(profiles);
  }

  private async generateOneSlot(
    prefs: ReturnType<typeof prefsFromProfiles>,
    request: HybridGenerationRequest,
  ): Promise<
    | { ok: true; recipe: Awaited<ReturnType<RecipeService["createAiRecipe"]>> }
    | { ok: false; reason: HybridFailureReason }
  > {
    let lastKind: "preference" | "schema" | "provider" | null = null;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS_PER_SLOT; attempt++) {
      let candidate;
      try {
        candidate = await this.generator.generate({
          attempt,
          seasonalGuidance: request.seasonalGuidance,
          budgetGuidance: request.budgetGuidance,
          excludeRecipeIds: request.excludeRecipeIds,
        });
      } catch {
        lastKind = "provider";
        continue;
      }

      try {
        const accept = tryAcceptAiCandidate(
          candidate,
          prefs,
          request.seasonalGuidance,
          request.budgetGuidance,
        );
        if (!accept.ok) {
          lastKind = "preference";
          continue;
        }
        try {
          const recipe = this.recipes.createAiRecipe(accept.fields);
          return { ok: true, recipe };
        } catch (err) {
          if (err instanceof DomainError && err.code === ErrorCode.RECIPE_LIBRARY_FULL) {
            return { ok: false, reason: "RECIPE_LIBRARY_FULL" };
          }
          throw err;
        }
      } catch (err) {
        if (err instanceof DomainError && err.code === ErrorCode.RECIPE_LIBRARY_FULL) {
          return { ok: false, reason: "RECIPE_LIBRARY_FULL" };
        }
        // Schema / catalog validation failures — retry within budget.
        lastKind = "schema";
        continue;
      }
    }

    if (lastKind === "provider") {
      return { ok: false, reason: "HYBRID_GENERATION_FAILED" };
    }
    return { ok: false, reason: "NO_SAFE_CANDIDATE_AFTER_RETRIES" };
  }
}

/** @deprecated use emptyHybridResult from domain — kept for quickstart clarity */
export { emptyHybridResult };
