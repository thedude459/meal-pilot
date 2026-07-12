import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/domain/errors.js";
import { INGREDIENT_UNITS, isKnownIngredientUnit, listIngredientUnits } from "../../src/domain/ingredient-units.js";
import { normalizeRecipeInput } from "../../src/domain/recipe.js";

describe("ingredient-units", () => {
  it("lists catalog with id, label, and kind", () => {
    const items = listIngredientUnits();
    expect(items.length).toBe(INGREDIENT_UNITS.length);
    expect(items[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      kind: expect.stringMatching(/^(volume|mass|count)$/),
    });
  });

  it("recognizes known units and rejects unknown", () => {
    expect(isKnownIngredientUnit("cup")).toBe(true);
    expect(isKnownIngredientUnit("not_a_unit")).toBe(false);
  });
});

describe("normalizeRecipeInput", () => {
  const base = {
    title: "  Pasta  ",
    ingredients: [{ name: "  pasta  ", quantity: 1.5555, unitId: "oz" }],
    instructionSteps: ["  Boil.  "],
  };

  it("trims fields, rounds quantity, forces curated source, collapses tags", () => {
    const result = normalizeRecipeInput({
      ...base,
      cuisineTags: ["Italian", "italian", "weeknight", "  "],
      dietaryAttributeIds: ["vegetarian", "vegetarian", "nut_free"],
      source: "ai",
      servings: 4,
      prepTimeMinutes: 5,
      cookTimeMinutes: 0,
    });
    expect(result).toEqual({
      title: "Pasta",
      ingredients: [{ name: "pasta", quantity: 1.556, unitId: "oz" }],
      instructionSteps: ["Boil."],
      cuisineTags: ["Italian", "weeknight"],
      dietaryAttributeIds: ["vegetarian", "nut_free"],
      servings: 4,
      prepTimeMinutes: 5,
      cookTimeMinutes: 0,
      source: "curated",
    });
  });

  it("rejects blank title", () => {
    try {
      normalizeRecipeInput({ ...base, title: "   " });
      expect.fail("expected validation");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it("rejects unknown unit", () => {
    try {
      normalizeRecipeInput({
        ...base,
        ingredients: [{ name: "flour", quantity: 1, unitId: "not_a_unit" }],
      });
      expect.fail("expected UNKNOWN_UNIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNKNOWN_UNIT);
    }
  });

  it("rejects unknown dietary tag", () => {
    try {
      normalizeRecipeInput({
        ...base,
        dietaryAttributeIds: ["not_a_real_restriction"],
      });
      expect.fail("expected UNKNOWN_RESTRICTION");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNKNOWN_RESTRICTION);
    }
  });

  it("rejects overlong cuisine tag", () => {
    try {
      normalizeRecipeInput({
        ...base,
        cuisineTags: ["x".repeat(41)],
      });
      expect.fail("expected RECIPE_LIMIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.RECIPE_LIMIT);
    }
  });

  it("rejects non-positive quantity", () => {
    try {
      normalizeRecipeInput({
        ...base,
        ingredients: [{ name: "salt", quantity: 0, unitId: "pinch" }],
      });
      expect.fail("expected validation");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it("preserves ingredient and step order", () => {
    const result = normalizeRecipeInput({
      title: "Order",
      ingredients: [
        { name: "a", quantity: 1, unitId: "cup" },
        { name: "b", quantity: 2, unitId: "cup" },
      ],
      instructionSteps: ["first", "second"],
    });
    expect(result.ingredients.map((i) => i.name)).toEqual(["a", "b"]);
    expect(result.instructionSteps).toEqual(["first", "second"]);
  });
});
