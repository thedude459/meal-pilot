import { describe, expect, it } from "vitest";
import {
  aggregatePreferences,
  assignDaysGreedy,
  buildGenerationReport,
  eligibleDays,
  isRecipeHardSafe,
  labelMatchesRecipe,
  matchesPhraseOrToken,
  pickAlternative,
  scoreCandidate,
  type CandidateRecipe,
  type HouseholdPreferenceAggregate,
} from "../../src/domain/meal-suggestion.js";
import type { MealSlotView } from "../../src/domain/weekly-plan.js";

function recipe(
  partial: Partial<CandidateRecipe> & Pick<CandidateRecipe, "id" | "title">,
): CandidateRecipe {
  return {
    ingredientNames: [],
    dietaryAttributeIds: [],
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    cuisineTags: [],
    ...partial,
  };
}

describe("meal-suggestion domain", () => {
  it("matchesPhraseOrToken: equality, token, and contiguous phrase", () => {
    expect(matchesPhraseOrToken("Anchovy", "anchovy fillets")).toBe(true);
    expect(matchesPhraseOrToken("green beans", "Fresh Green Beans")).toBe(true);
    expect(matchesPhraseOrToken("beans", "green beans")).toBe(true);
    expect(matchesPhraseOrToken("bean", "green beans")).toBe(false);
    expect(matchesPhraseOrToken("anchovy", "chicken thighs")).toBe(false);
  });

  it("labelMatchesRecipe against title and ingredients", () => {
    const r = recipe({
      id: "a",
      title: "Caesar salad",
      ingredientNames: ["Anchovy fillets", "Romaine"],
    });
    expect(labelMatchesRecipe("anchovy", r)).toBe(true);
    expect(labelMatchesRecipe("caesar salad", r)).toBe(true);
    expect(labelMatchesRecipe("tofu", r)).toBe(false);
  });

  it("dietary hard filter requires all restriction IDs on recipe", () => {
    const r = recipe({
      id: "a",
      title: "Pasta",
      dietaryAttributeIds: ["gluten_free"],
    });
    const prefs: HouseholdPreferenceAggregate = {
      hardRestrictionIds: ["gluten_free", "nut_free"],
      dislikes: [],
      likes: [],
    };
    expect(isRecipeHardSafe(r, prefs)).toBe(false);
    expect(
      isRecipeHardSafe(
        recipe({ ...r, dietaryAttributeIds: ["gluten_free", "nut_free"] }),
        prefs,
      ),
    ).toBe(true);
  });

  it("dislikes hard-exclude matching recipes", () => {
    const r = recipe({
      id: "a",
      title: "Salad",
      ingredientNames: ["Anchovy"],
      dietaryAttributeIds: ["gluten_free"],
    });
    const prefs: HouseholdPreferenceAggregate = {
      hardRestrictionIds: ["gluten_free"],
      dislikes: ["anchovy"],
      likes: [],
    };
    expect(isRecipeHardSafe(r, prefs)).toBe(false);
  });

  it("aggregatePreferences unions and dislike-wins over likes", () => {
    const agg = aggregatePreferences([
      { likes: ["chicken"], dislikes: ["anchovy"], dietaryRestrictionIds: ["gluten_free"] },
      { likes: ["chicken", "anchovy"], dislikes: [], dietaryRestrictionIds: ["nut_free"] },
    ]);
    expect(agg.hardRestrictionIds).toEqual(["gluten_free", "nut_free"]);
    expect(agg.dislikes.map((d) => d.toLowerCase())).toContain("anchovy");
    expect(agg.likes.map((l) => l.toLowerCase())).toContain("chicken");
    expect(agg.likes.map((l) => l.toLowerCase())).not.toContain("anchovy");
  });

  it("eligibleDays for fill-empty vs regenerate-non-approved", () => {
    const slots: MealSlotView[] = [
      { day: "monday", recipeId: "r1", recipeTitle: "A", status: "approved" },
      { day: "tuesday", recipeId: "r2", recipeTitle: "B", status: "pending" },
      { day: "wednesday", recipeId: null, recipeTitle: null, status: null },
      { day: "thursday", recipeId: "r3", recipeTitle: "C", status: "rejected" },
      { day: "friday", recipeId: null, recipeTitle: null, status: null },
      { day: "saturday", recipeId: null, recipeTitle: null, status: null },
      { day: "sunday", recipeId: null, recipeTitle: null, status: null },
    ];
    expect(eligibleDays("fill-empty", slots)).toEqual([
      "wednesday",
      "friday",
      "saturday",
      "sunday",
    ]);
    expect(eligibleDays("regenerate-non-approved", slots)).toEqual([
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
  });

  it("scoreCandidate boosts likes and pantry; timing prefers quicker", () => {
    const prefs: HouseholdPreferenceAggregate = {
      hardRestrictionIds: [],
      dislikes: [],
      likes: ["chicken"],
    };
    const ctx = {
      prefs,
      pantryNames: ["Chicken thighs"],
      weekAssignedIds: new Set<string>(),
      recentRecipeIds: new Set<string>(),
      weekCuisines: new Set<string>(),
      hardExcludeRotation: false,
    };
    const liked = recipe({
      id: "b",
      title: "Sheet-pan chicken",
      ingredientNames: ["Chicken thighs"],
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
    });
    const other = recipe({
      id: "a",
      title: "Tofu stir fry",
      ingredientNames: ["Tofu"],
      prepTimeMinutes: 40,
      cookTimeMinutes: 40,
    });
    const sLiked = scoreCandidate(liked, ctx)!;
    const sOther = scoreCandidate(other, ctx)!;
    expect(sLiked).toBeGreaterThan(sOther);
  });

  it("assignDaysGreedy soft-relaxes rotation when needed; builds report", () => {
    const prefs: HouseholdPreferenceAggregate = {
      hardRestrictionIds: [],
      dislikes: [],
      likes: [],
    };
    const only = recipe({ id: "r1", title: "One meal", dietaryAttributeIds: [] });
    const { assignments, unfilled } = assignDaysGreedy({
      days: ["monday", "tuesday"],
      safeCandidates: [only],
      prefs,
      pantryNames: [],
      initialWeekAssignedIds: new Set(),
      recentRecipeIds: new Set(["r1"]),
      initialWeekCuisines: new Set(),
    });
    expect(assignments.size).toBe(2);
    expect(unfilled).toEqual([]);

    const empty = assignDaysGreedy({
      days: ["monday"],
      safeCandidates: [],
      prefs,
      pantryNames: [],
      initialWeekAssignedIds: new Set(),
      recentRecipeIds: new Set(),
      initialWeekCuisines: new Set(),
    });
    expect(empty.unfilled).toEqual(["monday"]);
    const report = buildGenerationReport("fill-empty", [], empty.unfilled);
    expect(report.unfilledDays[0]).toEqual({ day: "monday", reason: "NO_SAFE_CANDIDATES" });
  });

  it("pickAlternative excludes current recipeId", () => {
    const prefs: HouseholdPreferenceAggregate = {
      hardRestrictionIds: [],
      dislikes: [],
      likes: [],
    };
    const a = recipe({ id: "aaa", title: "A" });
    const b = recipe({ id: "bbb", title: "B" });
    const alt = pickAlternative({
      safeCandidates: [a, b],
      excludeRecipeId: "aaa",
      prefs,
      pantryNames: [],
      weekAssignedIds: new Set(["aaa"]),
      recentRecipeIds: new Set(),
      weekCuisines: new Set(),
    });
    expect(alt?.id).toBe("bbb");
  });
});
