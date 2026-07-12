import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/domain/errors.js";
import {
  assertGroceryUnitMatchesDefault,
  effectiveShoppingCategory,
  groupGroceryItems,
  normalizeGroceryItemCreateInput,
  normalizeGroceryItemReplaceInput,
  normalizeGroceryQuantity,
  normalizeSetCheckedInput,
  type GroceryItem,
} from "../../src/domain/grocery-item.js";
import { roundQuantity } from "../../src/domain/quantity.js";

describe("grocery-item domain", () => {
  it("rounds quantity via shared helper to ≤3 decimals", () => {
    expect(normalizeGroceryQuantity(12.5555)).toBe(roundQuantity(12.5555));
    expect(normalizeGroceryQuantity(12.5555)).toBe(12.556);
  });

  it("rejects non-positive or non-finite quantity with GROCERY_LIMIT", () => {
    for (const q of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      try {
        normalizeGroceryQuantity(q);
        expect.fail("expected GROCERY_LIMIT");
      } catch (err) {
        expect((err as { code: string }).code).toBe(ErrorCode.GROCERY_LIMIT);
      }
    }
  });

  it("rejects UNIT_MISMATCH when unit ≠ ingredient default", () => {
    try {
      assertGroceryUnitMatchesDefault("cup", "tbsp");
      expect.fail("expected UNIT_MISMATCH");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNIT_MISMATCH);
    }
  });

  it("maps null/unknown shopping category to other", () => {
    expect(effectiveShoppingCategory(null).id).toBe("other");
    expect(effectiveShoppingCategory(undefined).id).toBe("other");
    expect(effectiveShoppingCategory("not_a_category").id).toBe("other");
    expect(effectiveShoppingCategory("dairy").id).toBe("dairy");
    expect(effectiveShoppingCategory("dairy").label).toBe("Dairy");
  });

  it("groups by catalog order with Other last and A–Z within group ignoring checked", () => {
    const mk = (
      name: string,
      categoryId: string,
      checked: boolean,
    ): GroceryItem => ({
      id: name,
      householdId: "h",
      ingredientId: name,
      ingredientDisplayName: name,
      shoppingCategoryId: categoryId,
      shoppingCategoryLabel: categoryId,
      quantity: 1,
      unitId: "tbsp",
      checked,
      createdAt: "",
      updatedAt: "",
    });
    const groups = groupGroceryItems([
      mk("Zucchini", "produce", true),
      mk("Apple", "produce", false),
      mk("Milk", "dairy", false),
      mk("Mystery", "other", false),
    ]);
    expect(groups.map((g) => g.shoppingCategoryId)).toEqual(["produce", "dairy", "other"]);
    expect(groups[0]!.items.map((i) => i.ingredientDisplayName)).toEqual(["Apple", "Zucchini"]);
    expect(groups[0]!.items[1]!.checked).toBe(true);
  });

  it("rejects checked on create and replace", () => {
    try {
      normalizeGroceryItemCreateInput(
        { ingredientId: "x", quantity: 1, unitId: "tbsp", checked: true },
        "tbsp",
      );
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    try {
      normalizeGroceryItemReplaceInput({ quantity: 1, unitId: "tbsp", checked: false }, "tbsp");
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it("normalizeSetCheckedInput accepts only checked boolean", () => {
    expect(normalizeSetCheckedInput({ checked: true })).toBe(true);
    try {
      normalizeSetCheckedInput({ checked: true, quantity: 1 } as { checked: boolean });
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });
});
