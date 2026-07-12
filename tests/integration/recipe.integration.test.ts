import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../../src/db/client.js";
import { ErrorCode } from "../../src/domain/errors.js";
import { MAX_RECIPES_PER_HOUSEHOLD } from "../../src/domain/recipe.js";
import { RecipeService } from "../../src/services/recipe-service.js";

const minimal = {
  title: "Weeknight Pasta",
  ingredients: [
    { name: "pasta", quantity: 12, unitId: "oz" },
    { name: "olive oil", quantity: 1.5, unitId: "tbsp" },
  ],
  instructionSteps: ["Boil pasta until al dente.", "Toss with olive oil and serve."],
  servings: 4,
  prepTimeMinutes: 5,
  cookTimeMinutes: 15,
  cuisineTags: ["Italian", "italian", "weeknight"],
  dietaryAttributeIds: ["vegetarian", "vegetarian", "nut_free"],
};

describe("recipe integration", () => {
  let handle: DbHandle;
  let service: RecipeService;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-recipe-"));
    handle = createDb(join(dir, "test.sqlite"));
    runMigrations(handle.sqlite);
    service = new RecipeService(handle.db);
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it("createRecipe normalizes and persists curated recipe", () => {
    const created = service.createRecipe({ ...minimal, source: "ai" });
    expect(created.source).toBe("curated");
    expect(created.title).toBe("Weeknight Pasta");
    expect(created.cuisineTags).toEqual(["Italian", "weeknight"]);
    expect(created.dietaryAttributeIds).toEqual(["vegetarian", "nut_free"]);
    expect(created.ingredients[1]?.quantity).toBe(1.5);
    expect(service.getRecipe(created.id)).toEqual(created);
  });

  it("rejects unknown unit and leaves library empty", () => {
    try {
      service.createRecipe({
        title: "Bad",
        ingredients: [{ name: "flour", quantity: 1, unitId: "not_a_unit" }],
        instructionSteps: ["Mix."],
      });
      expect.fail("expected UNKNOWN_UNIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNKNOWN_UNIT);
    }
    expect(service.listRecipes().items).toHaveLength(0);
  });

  it("rejects unknown dietary tag and leaves library empty", () => {
    try {
      service.createRecipe({
        title: "Bad Tag",
        ingredients: [{ name: "rice", quantity: 1, unitId: "cup" }],
        instructionSteps: ["Cook."],
        dietaryAttributeIds: ["not_a_real_restriction"],
      });
      expect.fail("expected UNKNOWN_RESTRICTION");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNKNOWN_RESTRICTION);
    }
    expect(service.listRecipes().items).toHaveLength(0);
  });

  it("list and get support empty library and duplicate titles", () => {
    expect(service.listRecipes()).toEqual({ items: [], maxRecipes: MAX_RECIPES_PER_HOUSEHOLD });
    const a = service.createRecipe({ ...minimal, title: "Same" });
    const b = service.createRecipe({
      title: "Same",
      ingredients: [{ name: "rice", quantity: 1, unitId: "cup" }],
      instructionSteps: ["Cook."],
    });
    const list = service.listRecipes();
    expect(list.items).toHaveLength(2);
    expect(list.items.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
    expect(service.getRecipe(a.id).title).toBe("Same");
    expect(service.getRecipe(b.id).title).toBe("Same");
  });

  it("replaceRecipe full-replaces and preserves order; invalid replace leaves prior", () => {
    const created = service.createRecipe(minimal);
    const replaced = service.replaceRecipe(created.id, {
      title: "Weeknight Pasta",
      ingredients: [
        { name: "pasta", quantity: 12, unitId: "oz" },
        { name: "garlic", quantity: 2, unitId: "clove" },
      ],
      instructionSteps: ["Boil pasta.", "Add garlic oil."],
      cuisineTags: ["Italian"],
      dietaryAttributeIds: ["vegetarian"],
    });
    expect(replaced.ingredients.map((i) => i.name)).toEqual(["pasta", "garlic"]);
    expect(replaced.instructionSteps).toEqual(["Boil pasta.", "Add garlic oil."]);

    try {
      service.replaceRecipe(created.id, {
        title: "",
        ingredients: [{ name: "x", quantity: 1, unitId: "cup" }],
        instructionSteps: ["y"],
      });
      expect.fail("expected validation");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    expect(service.getRecipe(created.id).ingredients.map((i) => i.name)).toEqual([
      "pasta",
      "garlic",
    ]);
  });

  it("deleteRecipe permanently removes", () => {
    const created = service.createRecipe(minimal);
    service.deleteRecipe(created.id);
    expect(service.listRecipes().items).toHaveLength(0);
    try {
      service.deleteRecipe(created.id);
      expect.fail("expected NOT_FOUND");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it("isolates recipes across households", () => {
    const householdB = "00000000-0000-4000-8000-000000000099";
    handle.sqlite.prepare("INSERT INTO households (id) VALUES (?)").run(householdB);
    const serviceB = new RecipeService(handle.db, householdB);

    const inA = service.createRecipe(minimal);
    const inB = serviceB.createRecipe({
      title: "Other House",
      ingredients: [{ name: "rice", quantity: 1, unitId: "cup" }],
      instructionSteps: ["Cook."],
    });

    expect(service.listRecipes().items.map((i) => i.id)).toEqual([inA.id]);
    expect(serviceB.listRecipes().items.map((i) => i.id)).toEqual([inB.id]);
    try {
      service.getRecipe(inB.id);
      expect.fail("expected NOT_FOUND");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it("rejects create when library already has 500 recipes", () => {
    const now = new Date().toISOString();
    const insert = handle.sqlite.prepare(`
      INSERT INTO recipes (
        id, household_id, title, ingredients_json, instruction_steps_json,
        cuisine_tags_json, dietary_attribute_ids_json, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, '[]', '[]', 'curated', ?, ?)
    `);
    const ingredients = JSON.stringify([{ name: "x", quantity: 1, unitId: "cup" }]);
    const steps = JSON.stringify(["step"]);
    handle.sqlite.exec("BEGIN");
    for (let i = 0; i < MAX_RECIPES_PER_HOUSEHOLD; i++) {
      insert.run(
        `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        "00000000-0000-4000-8000-000000000001",
        `Recipe ${i}`,
        ingredients,
        steps,
        now,
        now,
      );
    }
    handle.sqlite.exec("COMMIT");

    expect(service.listRecipes().items).toHaveLength(MAX_RECIPES_PER_HOUSEHOLD);
    try {
      service.createRecipe(minimal);
      expect.fail("expected RECIPE_LIBRARY_FULL");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.RECIPE_LIBRARY_FULL);
      expect((err as { status: number }).status).toBe(409);
    }
    expect(service.listRecipes().items).toHaveLength(MAX_RECIPES_PER_HOUSEHOLD);
  });
});
