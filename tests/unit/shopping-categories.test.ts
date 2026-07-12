import { describe, expect, it } from "vitest";
import {
  isKnownShoppingCategory,
  listShoppingCategories,
  SHOPPING_CATEGORIES,
} from "../../src/domain/shopping-categories.js";

describe("shopping-categories catalog", () => {
  it("includes expected grocery groupings", () => {
    const ids = listShoppingCategories().map((c) => c.id);
    expect(ids).toEqual(SHOPPING_CATEGORIES.map((c) => c.id));
    expect(ids).toContain("produce");
    expect(ids).toContain("dairy");
    expect(ids).toContain("dry_goods");
    expect(isKnownShoppingCategory("spices")).toBe(true);
  });
});
