/**
 * MealSuggestionEngine facade — Speckit feature `011-meal-suggestion-engine`.
 *
 * Constitution / Speckit name: **MealSuggestionEngine**.
 * Implementation alias: this class (`MealSuggestionService`) + pure domain
 * helpers in `src/domain/meal-suggestion.ts`.
 *
 * Behavior locked to GenerateWeeklyMeals (`008`). Internal-only: organizers
 * reach the engine via `POST /weekly-plans/generate` and reject→alternative on
 * `PUT /weekly-plans/{id}/slots/{day}/status` — no standalone suggest HTTP
 * surface in `011`.
 */
import { DEFAULT_HOUSEHOLD_ID, type AppDatabase } from "../db/client.js";
import { generationNoPreferencesError, validationError } from "../domain/errors.js";
import {
  aggregatePreferences,
  assignDaysGreedy,
  buildGenerationReport,
  eligibleDays,
  isGenerationMode,
  isRecipeHardSafe,
  normalizeMatchText,
  pickAlternative,
  rotationWindowStart,
  toCandidateRecipe,
  type AlternativeOutcome,
  type GenerationMode,
  type GenerationReport,
  type HouseholdPreferenceAggregate,
} from "../domain/meal-suggestion.js";
import { assertMondayWeekStart, type Weekday, type WeeklyPlan } from "../domain/weekly-plan.js";
import { FamilyMemberService } from "./family-member-service.js";
import { PantryItemService } from "./pantry-item-service.js";
import { RecipeService } from "./recipe-service.js";
import { WeeklyPlanService } from "./weekly-plan-service.js";

export type GenerateWeeklyMealsInput = {
  weekStartDate: unknown;
  mode?: unknown;
};

export type GenerateWeeklyMealsResult = {
  plan: WeeklyPlan;
  report: GenerationReport;
};

export type RejectWithAlternativeResult = WeeklyPlan & {
  alternativeOutcome: AlternativeOutcome;
};

export class MealSuggestionService {
  private readonly familyMembers: FamilyMemberService;
  private readonly recipes: RecipeService;
  private readonly pantry: PantryItemService;
  private readonly weeklyPlans: WeeklyPlanService;

  constructor(
    db: AppDatabase,
    householdId = DEFAULT_HOUSEHOLD_ID,
    deps?: {
      familyMembers?: FamilyMemberService;
      recipes?: RecipeService;
      pantry?: PantryItemService;
      weeklyPlans?: WeeklyPlanService;
    },
  ) {
    this.familyMembers =
      deps?.familyMembers ?? new FamilyMemberService(db, householdId);
    this.recipes = deps?.recipes ?? new RecipeService(db, householdId);
    this.pantry = deps?.pantry ?? new PantryItemService(db, householdId);
    this.weeklyPlans = deps?.weeklyPlans ?? new WeeklyPlanService(db, householdId);
  }

  /**
   * MealSuggestionEngine operation `generateWeeklyMeals` (service contract).
   * HTTP consumer: `POST /weekly-plans/generate` (`008`).
   */
  generateWeeklyMeals(input: GenerateWeeklyMealsInput): GenerateWeeklyMealsResult {
    const weekStartDate = assertMondayWeekStart(input.weekStartDate);
    const mode = this.parseMode(input.mode);

    const members = this.familyMembers.listFamilyMembers().items;
    if (members.length === 0) {
      throw generationNoPreferencesError();
    }

    const profiles = members.map((m) => this.familyMembers.getPreferences(m.id));
    const prefs = aggregatePreferences(profiles);

    let plan = this.weeklyPlans.findByWeekStart(weekStartDate);
    if (!plan) {
      try {
        plan = this.weeklyPlans.createWeeklyPlan({ weekStartDate });
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : "";
        if (code === "WEEKLY_PLAN_CONFLICT") {
          plan = this.weeklyPlans.findByWeekStart(weekStartDate);
          if (!plan) throw err;
        } else {
          throw err;
        }
      }
    }

    const days = eligibleDays(mode, plan.slots);
    return this.runGenerate(plan, mode, days, prefs);
  }

  /**
   * MealSuggestionEngine operation `rejectWithAlternative` (service contract).
   * HTTP consumer: `PUT /weekly-plans/{id}/slots/{day}/status` when
   * `status === "rejected"` (`008`). No separate suggest-only route.
   */
  rejectWithAlternative(weeklyPlanId: string, day: string): RejectWithAlternativeResult {
    const plan = this.weeklyPlans.getWeeklyPlan(weeklyPlanId);
    const slot = plan.slots.find((s) => s.day === day);
    if (!slot?.recipeId) {
      const rejected = this.weeklyPlans.setSlotStatus(weeklyPlanId, day, "rejected");
      return {
        ...rejected,
        alternativeOutcome: { applied: false, reason: "NO_SAFE_ALTERNATIVE" },
      };
    }

    const members = this.familyMembers.listFamilyMembers().items;
    const profiles = members.map((m) => this.familyMembers.getPreferences(m.id));
    const prefs = aggregatePreferences(profiles);
    const safeCandidates = this.safeCandidates(prefs);
    const pantryNames = this.pantryNames();
    const recentRecipeIds = this.weeklyPlans.recipeIdsInWeekStartRange(
      rotationWindowStart(plan.weekStartDate),
      plan.weekStartDate,
    );

    const weekAssignedIds = new Set<string>();
    const weekCuisines = new Set<string>();
    const fullRecipes = this.recipes.listFullRecipes();
    for (const s of plan.slots) {
      if (!s.recipeId) continue;
      weekAssignedIds.add(s.recipeId);
      const full = fullRecipes.find((r) => r.id === s.recipeId);
      const cuisine = full?.cuisineTags[0];
      if (cuisine) weekCuisines.add(normalizeMatchText(cuisine));
    }

    const alt = pickAlternative({
      safeCandidates,
      excludeRecipeId: slot.recipeId,
      prefs,
      pantryNames,
      weekAssignedIds,
      recentRecipeIds,
      weekCuisines,
    });

    if (alt) {
      const updated = this.weeklyPlans.assignSlot(weeklyPlanId, day, alt.id);
      return { ...updated, alternativeOutcome: { applied: true } };
    }

    const rejected = this.weeklyPlans.setSlotStatus(weeklyPlanId, day, "rejected");
    return {
      ...rejected,
      alternativeOutcome: { applied: false, reason: "NO_SAFE_ALTERNATIVE" },
    };
  }

  private runGenerate(
    plan: WeeklyPlan,
    mode: GenerationMode,
    days: Weekday[],
    prefs: HouseholdPreferenceAggregate,
  ): GenerateWeeklyMealsResult {
    const safeCandidates = this.safeCandidates(prefs);
    const pantryNames = this.pantryNames();
    const recentRecipeIds = this.weeklyPlans.recipeIdsInWeekStartRange(
      rotationWindowStart(plan.weekStartDate),
      plan.weekStartDate,
    );

    const fullRecipes = this.recipes.listFullRecipes();
    const initialWeekAssignedIds = new Set<string>();
    const initialWeekCuisines = new Set<string>();
    for (const slot of plan.slots) {
      if (days.includes(slot.day) || !slot.recipeId) continue;
      initialWeekAssignedIds.add(slot.recipeId);
      const full = fullRecipes.find((r) => r.id === slot.recipeId);
      const cuisine = full?.cuisineTags[0];
      if (cuisine) initialWeekCuisines.add(normalizeMatchText(cuisine));
    }

    const { assignments, unfilled } = assignDaysGreedy({
      days,
      safeCandidates,
      prefs,
      pantryNames,
      initialWeekAssignedIds,
      recentRecipeIds,
      initialWeekCuisines,
    });

    const filledDays: Weekday[] = [];
    for (const day of days) {
      const pick = assignments.get(day);
      if (pick) {
        this.weeklyPlans.assignSlot(plan.id, day, pick.id);
        filledDays.push(day);
      }
    }

    return {
      plan: this.weeklyPlans.getWeeklyPlan(plan.id),
      report: buildGenerationReport(mode, filledDays, unfilled),
    };
  }

  private safeCandidates(prefs: HouseholdPreferenceAggregate) {
    return this.recipes
      .listFullRecipes()
      .map(toCandidateRecipe)
      .filter((c) => isRecipeHardSafe(c, prefs));
  }

  private pantryNames(): string[] {
    return this.pantry.listPantryItems().items.map((p) => p.ingredientDisplayName);
  }

  private parseMode(mode: unknown): GenerationMode {
    if (mode === undefined || mode === null) return "fill-empty";
    if (!isGenerationMode(mode)) {
      throw validationError('mode must be "fill-empty" or "regenerate-non-approved"');
    }
    return mode;
  }
}
