import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../../src/db/client.js";
import { ErrorCode } from "../../src/domain/errors.js";
import { FamilyMemberService } from "../../src/services/family-member-service.js";
import { IngredientService } from "../../src/services/ingredient-service.js";
import { MealSuggestionService } from "../../src/services/meal-suggestion-service.js";
import { PantryItemService } from "../../src/services/pantry-item-service.js";
import { RecipeService } from "../../src/services/recipe-service.js";
import { WeeklyPlanService } from "../../src/services/weekly-plan-service.js";

describe("meal-suggestion-engine integration (011)", () => {
  let handle: DbHandle;
  let members: FamilyMemberService;
  let recipes: RecipeService;
  let plans: WeeklyPlanService;
  let ingredients: IngredientService;
  let pantry: PantryItemService;
  let suggestions: MealSuggestionService;
  let otherHouseholdId: string;
  let otherSuggestions: MealSuggestionService;
  let otherMembers: FamilyMemberService;
  let otherRecipes: RecipeService;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-mse-"));
    handle = createDb(join(dir, "test.sqlite"));
    runMigrations(handle.sqlite);
    members = new FamilyMemberService(handle.db);
    recipes = new RecipeService(handle.db);
    plans = new WeeklyPlanService(handle.db);
    ingredients = new IngredientService(handle.db);
    pantry = new PantryItemService(handle.db);
    suggestions = new MealSuggestionService(handle.db);
    otherHouseholdId = randomUUID();
    otherMembers = new FamilyMemberService(handle.db, otherHouseholdId);
    otherRecipes = new RecipeService(handle.db, otherHouseholdId);
    otherSuggestions = new MealSuggestionService(handle.db, otherHouseholdId);
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  function seedMemberWithPrefs() {
    const m = members.createFamilyMember("Sam");
    members.replacePreferences(m.id, {
      likes: ["chicken"],
      dislikes: ["anchovy"],
      dietaryRestrictionIds: ["gluten_free"],
    });
    return m;
  }

  function seedSafeRecipe(title: string) {
    return recipes.createRecipe({
      title,
      ingredients: [{ name: "Chicken", quantity: 1, unitId: "lb" }],
      instructionSteps: ["Cook."],
      dietaryAttributeIds: ["gluten_free"],
      cuisineTags: ["american"],
      prepTimeMinutes: 10,
      cookTimeMinutes: 25,
    });
  }

  it("preference-safe generate never slots unsafe recipes; partial coverage reports NO_SAFE_CANDIDATES", () => {
    seedMemberWithPrefs();
    const safe = seedSafeRecipe("Chicken rice bowl");
    recipes.createRecipe({
      title: "Anchovy pasta",
      ingredients: [{ name: "Anchovy", quantity: 1, unitId: "oz" }],
      instructionSteps: ["Toss."],
      dietaryAttributeIds: [],
    });

    const result = suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
    const filled = result.plan.slots.filter((s) => s.recipeId);
    expect(filled.length).toBeGreaterThan(0);
    expect(filled.every((s) => s.recipeId === safe.id)).toBe(true);
    expect(result.report.unfilledDays.every((u) => u.reason === "NO_SAFE_CANDIDATES")).toBe(
      true,
    );
  });

  it("missing pantry ingredients do not hard-block generation", () => {
    seedMemberWithPrefs();
    seedSafeRecipe("Chicken rice bowl");
    const catalog = ingredients.createIngredient({
      displayName: "Rice",
      defaultUnitId: "cup",
    });
    pantry.createPantryItem({
      ingredientId: catalog.id,
      quantity: 2,
      unitId: "cup",
    });

    const result = suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
    expect(result.plan.slots.some((s) => s.recipeId)).toBe(true);
  });

  it("rejectWithAlternative applies different recipe or NO_SAFE_ALTERNATIVE", () => {
    seedMemberWithPrefs();
    const a = seedSafeRecipe("Chicken A");
    const b = seedSafeRecipe("Chicken B");
    const generated = suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
    const monday = generated.plan.slots.find((s) => s.day === "monday");
    expect(monday?.recipeId).toBeTruthy();

    const rejected = suggestions.rejectWithAlternative(generated.plan.id, "monday");
    if (rejected.alternativeOutcome.applied) {
      expect(rejected.slots.find((s) => s.day === "monday")?.recipeId).not.toBe(monday!.recipeId);
      expect(rejected.slots.find((s) => s.day === "monday")?.status).toBe("pending");
      expect([a.id, b.id]).toContain(
        rejected.slots.find((s) => s.day === "monday")?.recipeId,
      );
    } else {
      expect(rejected.alternativeOutcome).toEqual({
        applied: false,
        reason: "NO_SAFE_ALTERNATIVE",
      });
    }
  });

  it("zero FamilyMembers throws GENERATION_NO_PREFERENCES", () => {
    try {
      suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
      expect.fail("expected GENERATION_NO_PREFERENCES");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.GENERATION_NO_PREFERENCES);
    }
  });

  it("household isolation: A generate does not use B recipes", () => {
    seedMemberWithPrefs();
    seedSafeRecipe("A-house meal");
    handle.sqlite
      .prepare("INSERT INTO households (id, created_at) VALUES (?, ?)")
      .run(otherHouseholdId, new Date().toISOString());
    otherMembers.createFamilyMember("Blake");
    otherMembers.replacePreferences(otherMembers.listFamilyMembers().items[0]!.id, {
      likes: [],
      dislikes: [],
      dietaryRestrictionIds: ["gluten_free"],
    });
    otherRecipes.createRecipe({
      title: "B-only feast",
      ingredients: [{ name: "Chicken", quantity: 1, unitId: "lb" }],
      instructionSteps: ["Cook."],
      dietaryAttributeIds: ["gluten_free"],
    });

    const result = suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
    const titles = result.plan.slots.map((s) => s.recipeTitle).filter(Boolean);
    expect(titles.every((t) => t !== "B-only feast")).toBe(true);

    const other = otherSuggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
    const otherTitles = other.plan.slots.map((s) => s.recipeTitle).filter(Boolean);
    expect(otherTitles.every((t) => t !== "A-house meal")).toBe(true);
  });

  it("identical generate inputs are deterministic for filled recipe ids", () => {
    seedMemberWithPrefs();
    seedSafeRecipe("Meal One");
    seedSafeRecipe("Meal Two");
    const first = suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-20" });
    // Wipe plan and regenerate same week in a fresh service on same DB would reuse plan;
    // compare two greedy runs via regenerate-non-approved after clear is awkward —
    // instead create a second week with same library and compare assignment stability
    // by regenerating the same week after regenerate-non-approved with no approved slots.
    const again = suggestions.generateWeeklyMeals({
      weekStartDate: "2026-07-20",
      mode: "regenerate-non-approved",
    });
    const ids1 = first.plan.slots.map((s) => s.recipeId);
    const ids2 = again.plan.slots.map((s) => s.recipeId);
    expect(ids2).toEqual(ids1);
  });
});
