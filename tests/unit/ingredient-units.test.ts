import { describe, expect, it } from "vitest";
import { isKnownIngredientUnit, listIngredientUnits } from "../../src/domain/ingredient-units.js";

describe("ingredient-units catalog", () => {
  it("includes common cooking units from research catalog", () => {
    const ids = listIngredientUnits().map((u) => u.id);
    for (const id of ["tsp", "tbsp", "cup", "oz", "g", "piece", "to_taste"]) {
      expect(ids).toContain(id);
      expect(isKnownIngredientUnit(id)).toBe(true);
    }
  });
});
