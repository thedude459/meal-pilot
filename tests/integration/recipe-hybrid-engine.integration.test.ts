import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../../src/db/client.js";
import { ErrorCode } from "../../src/domain/errors.js";
import {
  isRecipeHardSafe,
  toCandidateRecipe,
} from "../../src/domain/meal-suggestion.js";
import { MAX_RECIPES_PER_HOUSEHOLD } from "../../src/domain/recipe.js";
import { prefsFromProfiles } from "../../src/domain/recipe-hybrid.js";
import { FamilyMemberService } from "../../src/services/family-member-service.js";
import { RecipeHybridService } from "../../src/services/recipe-hybrid-service.js";
import { RecipeService } from "../../src/services/recipe-service.js";

describe("recipe-hybrid-engine integration (012)", () => {
  let handle: DbHandle;
  let members: FamilyMemberService;
  let recipes: RecipeService;
  let otherHouseholdId: string;
  let otherMembers: FamilyMemberService;
  let otherRecipes: RecipeService;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-rhe-"));
    handle = createDb(join(dir, "test.sqlite"));
    runMigrations(handle.sqlite);
    members = new FamilyMemberService(handle.db);
    recipes = new RecipeService(handle.db);
    otherHouseholdId = randomUUID();
    otherMembers = new FamilyMemberService(handle.db, otherHouseholdId);
    otherRecipes = new RecipeService(handle.db, otherHouseholdId);
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

  function safeStub(title = "AI Chicken Bowl") {
    return {
      async generate() {
        return {
          title,
          ingredients: [
            { name: "Chicken", quantity: 1, unitId: "lb" },
            { name: "Rice", quantity: 2, unitId: "cup" },
          ],
          instructionSteps: ["Cook rice", "Cook chicken", "Combine"],
          dietaryAttributeIds: ["gluten_free"],
          cuisineTags: ["american"],
        };
      },
    };
  }

  it("generateRecipe persists source=ai preference-safe recipe", async () => {
    seedMemberWithPrefs();
    const hybrid = new RecipeHybridService(handle.db, { generator: safeStub() });
    const result = await hybrid.generateRecipe({ seasonalGuidance: "summer" });
    expect(result.acceptedCount).toBe(1);
    expect(result.accepted[0]?.source).toBe("ai");
    expect(result.accepted[0]?.cuisineTags).toContain("summer");
    const listed = recipes.listFullRecipes();
    expect(listed.some((r) => r.id === result.accepted[0]?.id && r.source === "ai")).toBe(true);
  });

  it("unsafe candidates leave library unchanged after retries", async () => {
    seedMemberWithPrefs();
    let calls = 0;
    const hybrid = new RecipeHybridService(handle.db, {
      generator: {
        async generate() {
          calls += 1;
          return {
            title: "Anchovy pasta",
            ingredients: [{ name: "Anchovy", quantity: 1, unitId: "oz" }],
            instructionSteps: ["Toss"],
            dietaryAttributeIds: [],
          };
        },
      },
    });
    const before = recipes.listFullRecipes().length;
    const result = await hybrid.generateRecipe();
    expect(calls).toBe(3);
    expect(result.acceptedCount).toBe(0);
    expect(result.unmetCount).toBe(1);
    expect(result.failures[0]?.reason).toBe("NO_SAFE_CANDIDATE_AFTER_RETRIES");
    expect(recipes.listFullRecipes().length).toBe(before);
  });

  it("empty-preference household accepts schema-valid AI recipe", async () => {
    members.createFamilyMember("Pat");
    const hybrid = new RecipeHybridService(handle.db, {
      generator: {
        async generate() {
          return {
            title: "Plain rice",
            ingredients: [{ name: "Rice", quantity: 1, unitId: "cup" }],
            instructionSteps: ["Boil"],
            dietaryAttributeIds: [],
          };
        },
      },
    });
    const result = await hybrid.generateRecipe();
    expect(result.acceptedCount).toBe(1);
    expect(result.accepted[0]?.source).toBe("ai");
  });

  it("hybridFill returns partial success / unmet reasons; AI recipes are hard-safe", async () => {
    seedMemberWithPrefs();
    let n = 0;
    const hybrid = new RecipeHybridService(handle.db, {
      generator: {
        async generate() {
          n += 1;
          if (n <= 2) {
            return {
              title: `AI Meal ${n}`,
              ingredients: [{ name: "Chicken", quantity: 1, unitId: "lb" }],
              instructionSteps: ["Cook"],
              dietaryAttributeIds: ["gluten_free"],
            };
          }
          return {
            title: "Anchovy fail",
            ingredients: [{ name: "Anchovy", quantity: 1, unitId: "oz" }],
            instructionSteps: ["Nope"],
            dietaryAttributeIds: [],
          };
        },
      },
    });
    const result = await hybrid.hybridFill({ count: 3 });
    expect(result.acceptedCount).toBe(2);
    expect(result.unmetCount).toBe(1);
    expect(result.failures.length).toBeGreaterThan(0);

    const prefs = prefsFromProfiles([
      members.getPreferences(members.listFamilyMembers().items[0]!.id),
    ]);
    for (const r of result.accepted) {
      expect(isRecipeHardSafe(toCandidateRecipe(r), prefs)).toBe(true);
      expect(recipes.listFullRecipes().some((x) => x.id === r.id)).toBe(true);
    }
  });

  it("library full reports RECIPE_LIBRARY_FULL without inserting", async () => {
    seedMemberWithPrefs();
    for (let i = 0; i < MAX_RECIPES_PER_HOUSEHOLD; i++) {
      recipes.createRecipe({
        title: `R${i}`,
        ingredients: [{ name: "Rice", quantity: 1, unitId: "cup" }],
        instructionSteps: ["Cook"],
        dietaryAttributeIds: ["gluten_free"],
      });
    }
    const hybrid = new RecipeHybridService(handle.db, { generator: safeStub() });
    const result = await hybrid.generateRecipe();
    expect(result.acceptedCount).toBe(0);
    expect(result.failures[0]?.reason).toBe("RECIPE_LIBRARY_FULL");
  });

  it("substitution: distinct on curated; replace forbidden; AI replace-in-place", async () => {
    seedMemberWithPrefs();
    const curated = recipes.createRecipe({
      title: "Curated bowl",
      ingredients: [
        { name: "Chicken", quantity: 1, unitId: "lb" },
        { name: "Rice", quantity: 1, unitId: "cup" },
      ],
      instructionSteps: ["Cook"],
      dietaryAttributeIds: ["gluten_free"],
    });
    const hybrid = new RecipeHybridService(handle.db, { generator: safeStub() });

    const distinct = await hybrid.substituteIngredient({
      recipeId: curated.id,
      ingredientName: "Chicken",
      replacement: { name: "Turkey", quantity: 1, unitId: "lb" },
      mode: "distinct",
    });
    expect(distinct.modeApplied).toBe("distinct");
    expect(distinct.recipe.source).toBe("ai");
    expect(distinct.recipe.id).not.toBe(curated.id);
    expect(recipes.getRecipe(curated.id).ingredients[0]?.name).toBe("Chicken");

    await expect(
      hybrid.substituteIngredient({
        recipeId: curated.id,
        ingredientName: "Chicken",
        replacement: { name: "Turkey", quantity: 1, unitId: "lb" },
        mode: "replace-in-place",
      }),
    ).rejects.toMatchObject({ code: ErrorCode.HYBRID_REPLACE_CURATED_FORBIDDEN });

    const ai = distinct.recipe;
    const replaced = await hybrid.substituteIngredient({
      recipeId: ai.id,
      ingredientName: "Turkey",
      replacement: { name: "Tofu", quantity: 1, unitId: "lb" },
      mode: "replace-in-place",
    });
    expect(replaced.modeApplied).toBe("replace-in-place");
    expect(replaced.recipe.id).toBe(ai.id);
    expect(replaced.recipe.source).toBe("ai");
    expect(replaced.recipe.ingredients.some((i) => i.name === "Tofu")).toBe(true);
  });

  it("household isolation: B cannot see A recipes via hybrid service", async () => {
    seedMemberWithPrefs();
    const hybridA = new RecipeHybridService(handle.db, { generator: safeStub("A meal") });
    const created = await hybridA.generateRecipe();
    expect(created.acceptedCount).toBe(1);

    handle.sqlite
      .prepare("INSERT INTO households (id, created_at) VALUES (?, ?)")
      .run(otherHouseholdId, new Date().toISOString());
    otherMembers.createFamilyMember("Other");
    otherMembers.replacePreferences(otherMembers.listFamilyMembers().items[0]!.id, {
      likes: [],
      dislikes: [],
      dietaryRestrictionIds: ["gluten_free"],
    });
    const hybridB = new RecipeHybridService(handle.db, {
      generator: safeStub("B meal"),
      householdId: otherHouseholdId,
    });
    const bList = otherRecipes.listFullRecipes();
    expect(bList.some((r) => r.id === created.accepted[0]?.id)).toBe(false);
    const bGen = await hybridB.generateRecipe();
    expect(bGen.accepted[0]?.title).toBe("B meal");
    expect(recipes.listFullRecipes().some((r) => r.id === bGen.accepted[0]?.id)).toBe(false);
  });
});
