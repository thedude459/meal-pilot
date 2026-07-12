import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/domain/errors.js";
import {
  MAX_GENERATION_ATTEMPTS_PER_SLOT,
  applySoftGuidanceTags,
  assertStructuredReplacement,
  assertSubstitutionModeAllowed,
  buildSubstitutedRecipeInput,
  candidateInputFromAi,
  findIngredientIndex,
  prefsFromProfiles,
  tryAcceptAiCandidate,
  validateAiCandidateDeterministic,
} from "../../src/domain/recipe-hybrid.js";
import { normalizeAiRecipeInput, normalizeRecipeInput } from "../../src/domain/recipe.js";
import type { Recipe } from "../../src/domain/recipe.js";

const safeCandidate = {
  title: "AI Chicken Bowl",
  ingredients: [
    { name: "Chicken", quantity: 1, unitId: "lb" },
    { name: "Rice", quantity: 2, unitId: "cup" },
  ],
  instructionSteps: ["Cook rice", "Cook chicken", "Combine"],
  dietaryAttributeIds: ["gluten_free"],
  cuisineTags: ["american"],
};

describe("recipe-hybrid domain (012)", () => {
  it("normalizeAiRecipeInput forces source=ai; curated normalize stays curated", () => {
    const ai = normalizeAiRecipeInput({ ...safeCandidate, source: "curated" });
    expect(ai.source).toBe("ai");
    const curated = normalizeRecipeInput({ ...safeCandidate, source: "ai" });
    expect(curated.source).toBe("curated");
  });

  it("accepts preference-safe candidates and rejects dislike/dietary violations", () => {
    const prefs = prefsFromProfiles([
      {
        likes: ["chicken"],
        dislikes: ["anchovy"],
        dietaryRestrictionIds: ["gluten_free"],
      },
    ]);
    const ok = tryAcceptAiCandidate(safeCandidate, prefs);
    expect(ok.ok).toBe(true);

    const dislike = tryAcceptAiCandidate(
      {
        ...safeCandidate,
        title: "Anchovy surprise",
        ingredients: [{ name: "Anchovy", quantity: 1, unitId: "oz" }],
      },
      prefs,
    );
    expect(dislike).toEqual({ ok: false, kind: "preference" });

    const missingDiet = tryAcceptAiCandidate(
      { ...safeCandidate, dietaryAttributeIds: [] },
      prefs,
    );
    expect(missingDiet).toEqual({ ok: false, kind: "preference" });
  });

  it("empty prefs aggregate accepts schema-valid candidates (vacuous hard-match)", () => {
    const prefs = prefsFromProfiles([]);
    const ok = tryAcceptAiCandidate(
      { ...safeCandidate, dietaryAttributeIds: [] },
      prefs,
    );
    expect(ok.ok).toBe(true);
  });

  it("retry budget constant is 3", () => {
    expect(MAX_GENERATION_ATTEMPTS_PER_SLOT).toBe(3);
  });

  it("validation is deterministic for identical candidate + prefs", () => {
    const prefs = prefsFromProfiles([
      { likes: [], dislikes: ["anchovy"], dietaryRestrictionIds: ["gluten_free"] },
    ]);
    const a = validateAiCandidateDeterministic(safeCandidate, prefs);
    const b = validateAiCandidateDeterministic(safeCandidate, prefs);
    expect(a).toBe("accept");
    expect(b).toBe(a);
    expect(validateAiCandidateDeterministic({ ...safeCandidate, title: "" }, prefs)).toBe(
      "schema_reject",
    );
  });

  it("soft guidance merges into cuisine tags without dropping existing", () => {
    expect(applySoftGuidanceTags(["american"], "summer", "budget")).toEqual([
      "american",
      "summer",
      "budget",
    ]);
    const input = candidateInputFromAi(safeCandidate, "summer", undefined);
    expect(input.cuisineTags).toContain("summer");
    expect(input.cuisineTags).toContain("american");
  });

  it("requires structured replacement and finds ingredient case-insensitively", () => {
    expect(() => assertStructuredReplacement(undefined)).toThrow(/replacement/i);
    const line = assertStructuredReplacement({
      name: "Turkey",
      quantity: 1,
      unitId: "lb",
    });
    expect(line.name).toBe("Turkey");

    const recipe: Recipe = {
      id: "r1",
      title: "Bowl",
      ingredients: [{ name: "Chicken", quantity: 1, unitId: "lb" }],
      instructionSteps: ["Cook"],
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      cuisineTags: [],
      dietaryAttributeIds: ["gluten_free"],
      source: "curated",
      createdAt: "",
      updatedAt: "",
    };
    expect(findIngredientIndex(recipe, "chicken")).toBe(0);
    expect(findIngredientIndex(recipe, "beef")).toBe(-1);

    const input = buildSubstitutedRecipeInput(recipe, "Chicken", line);
    expect(input.ingredients?.[0]?.name).toBe("Turkey");
    expect(input.source).toBe("ai");
  });

  it("forbids replace-in-place on curated recipes", () => {
    const curated: Recipe = {
      id: "c1",
      title: "Curated",
      ingredients: [{ name: "Chicken", quantity: 1, unitId: "lb" }],
      instructionSteps: ["Cook"],
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      cuisineTags: [],
      dietaryAttributeIds: [],
      source: "curated",
      createdAt: "",
      updatedAt: "",
    };
    expect(() => assertSubstitutionModeAllowed(curated, "replace-in-place")).toThrow(
      expect.objectContaining({ code: ErrorCode.HYBRID_REPLACE_CURATED_FORBIDDEN }),
    );
    expect(() => assertSubstitutionModeAllowed(curated, "distinct")).not.toThrow();
  });
});
