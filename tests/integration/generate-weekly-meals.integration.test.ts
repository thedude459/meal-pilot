import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../../src/db/client.js";
import { ErrorCode } from "../../src/domain/errors.js";
import { MAX_WEEKLY_PLANS_PER_HOUSEHOLD } from "../../src/domain/weekly-plan.js";
import { FamilyMemberService } from "../../src/services/family-member-service.js";
import { MealSuggestionService } from "../../src/services/meal-suggestion-service.js";
import { RecipeService } from "../../src/services/recipe-service.js";
import { WeeklyPlanService } from "../../src/services/weekly-plan-service.js";

describe("generate-weekly-meals integration", () => {
  let handle: DbHandle;
  let members: FamilyMemberService;
  let recipes: RecipeService;
  let plans: WeeklyPlanService;
  let suggestions: MealSuggestionService;
  let otherHouseholdId: string;
  let otherSuggestions: MealSuggestionService;
  let otherMembers: FamilyMemberService;
  let otherRecipes: RecipeService;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-gen-"));
    handle = createDb(join(dir, "test.sqlite"));
    runMigrations(handle.sqlite);
    members = new FamilyMemberService(handle.db);
    recipes = new RecipeService(handle.db);
    plans = new WeeklyPlanService(handle.db);
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
    const m = members.createFamilyMember("Alex");
    members.replacePreferences(m.id, {
      likes: ["chicken"],
      dislikes: ["anchovy"],
      dietaryRestrictionIds: ["gluten_free"],
    });
    return m;
  }

  function seedSafeRecipe(title: string, extras?: { cuisine?: string; prep?: number }) {
    return recipes.createRecipe({
      title,
      ingredients: [{ name: "Chicken thighs", quantity: 1, unitId: "lb" }],
      instructionSteps: ["Cook."],
      dietaryAttributeIds: ["gluten_free"],
      cuisineTags: extras?.cuisine ? [extras.cuisine] : ["weeknight"],
      prepTimeMinutes: extras?.prep ?? 15,
      cookTimeMinutes: 20,
    });
  }

  it("generate creates plan, hard-excludes unsafe recipes, fill-empty leaves filled slots", () => {
    seedMemberWithPrefs();
    const safe = seedSafeRecipe("Sheet-pan chicken");
    recipes.createRecipe({
      title: "Wheat pasta",
      ingredients: [{ name: "Spaghetti", quantity: 12, unitId: "oz" }],
      instructionSteps: ["Boil."],
      dietaryAttributeIds: [],
    });
    recipes.createRecipe({
      title: "Caesar",
      ingredients: [{ name: "Anchovy fillets", quantity: 4, unitId: "piece" }],
      instructionSteps: ["Toss."],
      dietaryAttributeIds: ["gluten_free"],
    });

    const result = suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
    expect(result.plan.weekStartDate).toBe("2026-07-13");
    expect(result.report.mode).toBe("fill-empty");
    const filled = result.plan.slots.filter((s) => s.recipeId);
    expect(filled.length).toBeGreaterThan(0);
    expect(filled.every((s) => s.recipeId === safe.id)).toBe(true);
    expect(filled.every((s) => s.status === "pending")).toBe(true);

    plans.setSlotStatus(result.plan.id, "monday", "approved");
    const again = suggestions.generateWeeklyMeals({
      weekStartDate: "2026-07-13",
      mode: "fill-empty",
    });
    expect(again.plan.slots.find((s) => s.day === "monday")?.status).toBe("approved");
    expect(again.plan.slots.find((s) => s.day === "monday")?.recipeId).toBe(safe.id);
  });

  it("rejects non-Monday, zero members, and library full on create", () => {
    try {
      suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-14" });
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }

    try {
      suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
      expect.fail("expected GENERATION_NO_PREFERENCES");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.GENERATION_NO_PREFERENCES);
    }

    seedMemberWithPrefs();
    seedSafeRecipe("Safe");
    for (let i = 0; i < MAX_WEEKLY_PLANS_PER_HOUSEHOLD; i++) {
      const [y, m, d] = "2020-01-06".split("-").map(Number);
      const utc = new Date(Date.UTC(y!, m! - 1, d!));
      utc.setUTCDate(utc.getUTCDate() + i * 7);
      plans.createWeeklyPlan({ weekStartDate: utc.toISOString().slice(0, 10) });
    }
    try {
      suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
      expect.fail("expected WEEKLY_PLAN_LIBRARY_FULL");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.WEEKLY_PLAN_LIBRARY_FULL);
    }
  });

  it("household isolation: household A generate does not use household B data", () => {
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
      title: "B-only meal",
      ingredients: [{ name: "Salmon", quantity: 1, unitId: "lb" }],
      instructionSteps: ["Grill."],
      dietaryAttributeIds: ["gluten_free"],
    });

    const result = suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
    const titles = result.plan.slots
      .map((s) => s.recipeTitle)
      .filter((t): t is string => t !== null);
    expect(titles.every((t) => t !== "B-only meal")).toBe(true);

    const other = otherSuggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
    const otherTitles = other.plan.slots
      .map((s) => s.recipeTitle)
      .filter((t): t is string => t !== null);
    expect(otherTitles.every((t) => t !== "A-house meal")).toBe(true);
  });

  it("reject→alternative success and failure; regenerate-non-approved preserves approved", () => {
    seedMemberWithPrefs();
    const r1 = seedSafeRecipe("Meal One", { cuisine: "a", prep: 10 });
    const r2 = seedSafeRecipe("Meal Two", { cuisine: "b", prep: 12 });
    const gen = suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
    const monday = gen.plan.slots.find((s) => s.day === "monday")!;
    expect(monday.recipeId).toBeTruthy();

    plans.setSlotStatus(gen.plan.id, "monday", "approved");
    const tuesdayBefore = gen.plan.slots.find((s) => s.day === "tuesday")!;
    const rejected = suggestions.rejectWithAlternative(gen.plan.id, "tuesday");
    if (rejected.alternativeOutcome.applied) {
      expect(rejected.slots.find((s) => s.day === "tuesday")?.status).toBe("pending");
      expect(rejected.slots.find((s) => s.day === "tuesday")?.recipeId).not.toBe(
        tuesdayBefore.recipeId,
      );
    } else {
      expect(rejected.slots.find((s) => s.day === "tuesday")?.status).toBe("rejected");
    }
    expect(rejected.slots.find((s) => s.day === "monday")?.status).toBe("approved");

    // Only one safe recipe left for alt failure path: clear library to one recipe
    const thinDir = mkdtempSync(join(tmpdir(), "meal-pilot-gen-thin-"));
    const thinHandle = createDb(join(thinDir, "test.sqlite"));
    runMigrations(thinHandle.sqlite);
    const thinMembers = new FamilyMemberService(thinHandle.db);
    const thinRecipes = new RecipeService(thinHandle.db);
    const thinPlans = new WeeklyPlanService(thinHandle.db);
    const thinSuggestions = new MealSuggestionService(thinHandle.db);
    const tm = thinMembers.createFamilyMember("Alex");
    thinMembers.replacePreferences(tm.id, {
      likes: [],
      dislikes: [],
      dietaryRestrictionIds: ["gluten_free"],
    });
    const only = thinRecipes.createRecipe({
      title: "Only meal",
      ingredients: [{ name: "Chicken", quantity: 1, unitId: "lb" }],
      instructionSteps: ["Cook."],
      dietaryAttributeIds: ["gluten_free"],
    });
    const thinPlan = thinPlans.createWeeklyPlan({
      weekStartDate: "2026-07-13",
      slots: [{ day: "monday", recipeId: only.id }],
    });
    const noAlt = thinSuggestions.rejectWithAlternative(thinPlan.id, "monday");
    expect(noAlt.alternativeOutcome).toEqual({
      applied: false,
      reason: "NO_SAFE_ALTERNATIVE",
    });
    expect(noAlt.slots.find((s) => s.day === "monday")?.status).toBe("rejected");
    thinHandle.sqlite.close();

    void r1;
    void r2;
    const regen = suggestions.generateWeeklyMeals({
      weekStartDate: "2026-07-13",
      mode: "regenerate-non-approved",
    });
    expect(regen.report.mode).toBe("regenerate-non-approved");
    expect(regen.plan.slots.find((s) => s.day === "monday")?.status).toBe("approved");
  });

  it("partial coverage reports unfilled days and creates no AI recipes", () => {
    seedMemberWithPrefs();
    // No safe recipes
    recipes.createRecipe({
      title: "Unsafe",
      ingredients: [{ name: "Wheat", quantity: 1, unitId: "lb" }],
      instructionSteps: ["Bake."],
      dietaryAttributeIds: [],
    });
    const beforeCount = recipes.listRecipes().items.length;
    const result = suggestions.generateWeeklyMeals({ weekStartDate: "2026-07-13" });
    expect(result.plan.slots.every((s) => s.recipeId === null)).toBe(true);
    expect(result.report.unfilledDays.length).toBe(7);
    expect(result.report.unfilledDays.every((u) => u.reason === "NO_SAFE_CANDIDATES")).toBe(
      true,
    );
    expect(recipes.listRecipes().items.length).toBe(beforeCount);
    expect(recipes.listFullRecipes().every((r) => r.source === "curated")).toBe(true);
  });
});
