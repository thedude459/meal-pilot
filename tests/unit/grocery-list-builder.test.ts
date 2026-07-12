import { describe, expect, it } from "vitest";
import {
  availablePantryQuantity,
  buildCatalogMatchIndex,
  buildGrocerySyncPlan,
  matchRecipeName,
  mergeApprovedIngredients,
  utcToday,
} from "../../src/domain/grocery-list-builder.js";

const chicken = {
  id: "ing-chicken",
  displayName: "Chicken thighs",
  defaultUnitId: "lb",
  aliases: [],
};
const oil = {
  id: "ing-oil",
  displayName: "Olive oil",
  defaultUnitId: "tbsp",
  aliases: ["EVOO"],
};

describe("grocery-list-builder domain", () => {
  it("matches display name and aliases case-insensitively", () => {
    const index = buildCatalogMatchIndex([chicken, oil]);
    expect(matchRecipeName("chicken thighs", index)?.id).toBe("ing-chicken");
    expect(matchRecipeName("EVOO", index)?.id).toBe("ing-oil");
    expect(matchRecipeName("mystery", index)).toBeUndefined();
  });

  it("merges quantities for matching units and reports unit conflicts; name match enters merged set", () => {
    const index = buildCatalogMatchIndex([chicken, oil]);
    const { mergedSet, unmatched, unitConflicts } = mergeApprovedIngredients(
      [
        {
          day: "monday",
          recipeId: "r1",
          ingredients: [
            { name: "Chicken thighs", quantity: 1.5, unitId: "lb" },
            { name: "Olive oil", quantity: 2, unitId: "cup" },
            { name: "Mystery spice", quantity: 1, unitId: "tsp" },
          ],
        },
        {
          day: "tuesday",
          recipeId: "r2",
          ingredients: [{ name: "Chicken thighs", quantity: 1, unitId: "lb" }],
        },
      ],
      index,
    );

    expect(mergedSet.get("ing-chicken")?.mergedNeed).toBe(2.5);
    expect(mergedSet.has("ing-oil")).toBe(true);
    expect(mergedSet.get("ing-oil")?.mergedNeed).toBe(0);
    expect(unitConflicts).toHaveLength(1);
    expect(unitConflicts[0]?.expectedUnitId).toBe("tbsp");
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.ingredientName).toBe("Mystery spice");
  });

  it("treats expired pantry as unavailable; null expiration as available", () => {
    const today = "2026-07-12";
    expect(
      availablePantryQuantity(
        { ingredientId: "ing-oil", quantity: 5, expirationDate: "2026-07-11" },
        today,
      ),
    ).toBe(0);
    expect(
      availablePantryQuantity(
        { ingredientId: "ing-oil", quantity: 5, expirationDate: "2026-07-12" },
        today,
      ),
    ).toBe(5);
    expect(
      availablePantryQuantity(
        { ingredientId: "ing-oil", quantity: 3, expirationDate: null },
        today,
      ),
    ).toBe(3);
    expect(utcToday(new Date(Date.UTC(2026, 6, 12)))).toBe("2026-07-12");
  });

  it("computes net need shortfall and sync plan with checked shortfall", () => {
    const plan = buildGrocerySyncPlan({
      weekStartDate: "2026-07-13",
      approvedSlotCount: 2,
      todayUtc: "2026-07-12",
      catalog: [chicken, oil],
      pantryByIngredientId: new Map([
        ["ing-oil", { ingredientId: "ing-oil", quantity: 1, expirationDate: null }],
      ]),
      slots: [
        {
          day: "monday",
          recipeId: "r1",
          ingredients: [
            { name: "Chicken thighs", quantity: 1.5, unitId: "lb" },
            { name: "Olive oil", quantity: 2, unitId: "tbsp" },
          ],
        },
        {
          day: "tuesday",
          recipeId: "r2",
          ingredients: [{ name: "Chicken thighs", quantity: 1, unitId: "lb" }],
        },
      ],
      existingGrocery: [
        {
          id: "g-chicken",
          ingredientId: "ing-chicken",
          quantity: 1,
          unitId: "lb",
          checked: true,
        },
      ],
    });

    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]?.ingredientId).toBe("ing-oil");
    expect(plan.creates[0]?.quantity).toBe(1);
    expect(plan.updates).toHaveLength(0);
    expect(plan.report.checkedSkips).toEqual([
      {
        ingredientId: "ing-chicken",
        checkedQuantity: 1,
        netNeed: 2.5,
        remainingShortfall: 1.5,
      },
    ]);
  });

  it("removes unchecked in merged set with net need 0; leaves out-of-set unchecked", () => {
    const plan = buildGrocerySyncPlan({
      weekStartDate: "2026-07-13",
      approvedSlotCount: 1,
      todayUtc: "2026-07-12",
      catalog: [chicken, oil],
      pantryByIngredientId: new Map([
        ["ing-chicken", { ingredientId: "ing-chicken", quantity: 10, expirationDate: null }],
      ]),
      slots: [
        {
          day: "monday",
          recipeId: "r1",
          ingredients: [{ name: "Chicken thighs", quantity: 2, unitId: "lb" }],
        },
      ],
      existingGrocery: [
        {
          id: "g-chicken",
          ingredientId: "ing-chicken",
          quantity: 2,
          unitId: "lb",
          checked: false,
        },
        {
          id: "g-oil",
          ingredientId: "ing-oil",
          quantity: 1,
          unitId: "tbsp",
          checked: false,
        },
      ],
    });

    expect(plan.deletes.map((d) => d.ingredientId)).toEqual(["ing-chicken"]);
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
    expect(plan.projectedCount).toBe(1);
    expect(plan.report.pantryCovered[0]?.ingredientId).toBe("ing-chicken");
  });

  it("all-unit-conflict stays in merged set and removes unchecked", () => {
    const plan = buildGrocerySyncPlan({
      weekStartDate: "2026-07-13",
      approvedSlotCount: 1,
      todayUtc: "2026-07-12",
      catalog: [oil],
      pantryByIngredientId: new Map(),
      slots: [
        {
          day: "monday",
          recipeId: "r1",
          ingredients: [{ name: "Olive oil", quantity: 2, unitId: "cup" }],
        },
      ],
      existingGrocery: [
        {
          id: "g-oil",
          ingredientId: "ing-oil",
          quantity: 1,
          unitId: "tbsp",
          checked: false,
        },
      ],
    });

    expect(plan.report.unitConflicts).toHaveLength(1);
    expect(plan.deletes.map((d) => d.ingredientId)).toEqual(["ing-oil"]);
  });
});
