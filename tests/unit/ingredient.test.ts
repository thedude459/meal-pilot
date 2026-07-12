import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/domain/errors.js";
import {
  MAX_LABEL_LENGTH,
  normalizeIngredientInput,
  normalizeIngredientLabel,
  normalizeIngredientReplaceInput,
} from "../../src/domain/ingredient.js";
import {
  isKnownShoppingCategory,
  listShoppingCategories,
  SHOPPING_CATEGORIES,
} from "../../src/domain/shopping-categories.js";

describe("shopping-categories", () => {
  it("lists catalog with id and label", () => {
    const items = listShoppingCategories();
    expect(items.length).toBe(SHOPPING_CATEGORIES.length);
    expect(items[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
    });
  });

  it("recognizes known categories and rejects unknown", () => {
    expect(isKnownShoppingCategory("produce")).toBe(true);
    expect(isKnownShoppingCategory("not_a_category")).toBe(false);
  });
});

describe("normalizeIngredientLabel", () => {
  it("trims and collapses Unicode whitespace to one ASCII space", () => {
    expect(normalizeIngredientLabel("  Olive \t  oil  ")).toBe("Olive oil");
    expect(normalizeIngredientLabel("a\u00a0\u00a0b")).toBe("a b");
  });
});

describe("normalizeIngredientInput", () => {
  it("normalizes name, collapses aliases, and accepts category", () => {
    const result = normalizeIngredientInput({
      displayName: "  Olive   oil  ",
      defaultUnitId: "tbsp",
      shoppingCategoryId: "dry_goods",
      aliases: ["EVOO", "evoo", "extra virgin olive oil", "  "],
    });
    expect(result).toEqual({
      displayName: "Olive oil",
      displayNameKey: "olive oil",
      defaultUnitId: "tbsp",
      shoppingCategoryId: "dry_goods",
      aliases: ["EVOO", "extra virgin olive oil"],
    });
  });

  it("rejects blank display name", () => {
    try {
      normalizeIngredientInput({ displayName: "   ", defaultUnitId: "cup" });
      expect.fail("expected validation");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it("rejects unknown unit", () => {
    try {
      normalizeIngredientInput({ displayName: "Flour", defaultUnitId: "not_a_unit" });
      expect.fail("expected UNKNOWN_UNIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNKNOWN_UNIT);
    }
  });

  it("rejects unknown shopping category", () => {
    try {
      normalizeIngredientInput({
        displayName: "Flour",
        defaultUnitId: "cup",
        shoppingCategoryId: "not_a_category",
      });
      expect.fail("expected UNKNOWN_SHOPPING_CATEGORY");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNKNOWN_SHOPPING_CATEGORY);
    }
  });

  it("rejects overlong display name", () => {
    try {
      normalizeIngredientInput({
        displayName: "x".repeat(MAX_LABEL_LENGTH + 1),
        defaultUnitId: "cup",
      });
      expect.fail("expected INGREDIENT_LIMIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.INGREDIENT_LIMIT);
    }
  });

  it("rejects alias matching own display name", () => {
    try {
      normalizeIngredientInput({
        displayName: "Butter",
        defaultUnitId: "tbsp",
        aliases: ["butter"],
      });
      expect.fail("expected INGREDIENT_LABEL_CONFLICT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.INGREDIENT_LABEL_CONFLICT);
      expect((err as { status: number }).status).toBe(409);
    }
  });

  it("rejects rename+alias same-save conflict on replace", () => {
    try {
      normalizeIngredientReplaceInput({
        displayName: "Green onion",
        defaultUnitId: "piece",
        shoppingCategoryId: "produce",
        aliases: ["scallion", "green onion"],
      });
      expect.fail("expected INGREDIENT_LABEL_CONFLICT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.INGREDIENT_LABEL_CONFLICT);
    }
  });

  it("requires shoppingCategoryId and aliases on replace", () => {
    try {
      normalizeIngredientReplaceInput({
        displayName: "Butter",
        defaultUnitId: "tbsp",
      } as never);
      expect.fail("expected validation");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });
});
