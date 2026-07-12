import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/domain/errors.js";
import {
  isExpiredPantry,
  projectUpdatePantry,
  type PantryManagerIngredient,
  type PantryManagerPantryRow,
} from "../../src/domain/pantry-manager.js";

const oil: PantryManagerIngredient = {
  id: "ing-oil",
  displayName: "Olive oil",
  defaultUnitId: "tbsp",
};
const chicken: PantryManagerIngredient = {
  id: "ing-chicken",
  displayName: "Chicken thighs",
  defaultUnitId: "lb",
};

function catalog(...ings: PantryManagerIngredient[]) {
  return new Map(ings.map((i) => [i.id, i]));
}

describe("pantry-manager domain", () => {
  it("creates and increases with currentQuantity and rounded sums", () => {
    const pantry: PantryManagerPantryRow[] = [
      {
        id: "p-oil",
        ingredientId: "ing-oil",
        quantity: 2,
        unitId: "tbsp",
        expirationDate: null,
      },
    ];
    const plan = projectUpdatePantry({
      removeExpired: false,
      requireChecked: true,
      ingredientsById: catalog(oil, chicken),
      pantryRows: pantry,
      checkedGroceries: [
        {
          id: "g-oil",
          ingredientId: "ing-oil",
          quantity: 3.3334,
          unitId: "tbsp",
          checked: true,
        },
        {
          id: "g-chicken",
          ingredientId: "ing-chicken",
          quantity: 1.5,
          unitId: "lb",
          checked: true,
        },
      ],
    });

    expect(plan.report.appliedCount).toBe(2);
    const oilEntry = plan.report.applied.find((a) => a.ingredientId === "ing-oil");
    const chickenEntry = plan.report.applied.find((a) => a.ingredientId === "ing-chicken");
    expect(oilEntry).toMatchObject({
      action: "increased",
      currentQuantity: 2,
      groceryQuantity: 3.333,
      resultingQuantity: 5.333,
    });
    expect(chickenEntry).toMatchObject({
      action: "created",
      currentQuantity: null,
      groceryQuantity: 1.5,
      resultingQuantity: 1.5,
    });
    expect(plan.deleteGroceryIds).toEqual(expect.arrayContaining(["g-oil", "g-chicken"]));
    expect(plan.creates).toHaveLength(1);
    expect(plan.updates).toHaveLength(1);
  });

  it("rejects zero checked when requireChecked", () => {
    expect(() =>
      projectUpdatePantry({
        removeExpired: true,
        requireChecked: true,
        ingredientsById: catalog(oil),
        pantryRows: [],
        checkedGroceries: [],
      }),
    ).toThrowError(expect.objectContaining({ code: ErrorCode.UPDATE_PANTRY_NO_CHECKED }));
  });

  it("allows zero checked when preview (requireChecked false)", () => {
    const plan = projectUpdatePantry({
      removeExpired: false,
      requireChecked: false,
      ingredientsById: catalog(oil),
      pantryRows: [],
      checkedGroceries: [],
    });
    expect(plan.report.applied).toEqual([]);
    expect(plan.report.appliedCount).toBe(0);
  });

  it("fails on unit mismatch and unknown ingredient", () => {
    expect(() =>
      projectUpdatePantry({
        removeExpired: false,
        requireChecked: true,
        ingredientsById: catalog(oil),
        pantryRows: [],
        checkedGroceries: [
          {
            id: "g1",
            ingredientId: "ing-oil",
            quantity: 1,
            unitId: "cup",
            checked: true,
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: ErrorCode.UNIT_MISMATCH }));

    expect(() =>
      projectUpdatePantry({
        removeExpired: false,
        requireChecked: true,
        ingredientsById: catalog(oil),
        pantryRows: [],
        checkedGroceries: [
          {
            id: "g1",
            ingredientId: "missing",
            quantity: 1,
            unitId: "tbsp",
            checked: true,
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: ErrorCode.VALIDATION_ERROR }));
  });

  it("isExpiredPantry uses strict before today UTC", () => {
    expect(isExpiredPantry("2026-07-11", "2026-07-12")).toBe(true);
    expect(isExpiredPantry("2026-07-12", "2026-07-12")).toBe(false);
    expect(isExpiredPantry(null, "2026-07-12")).toBe(false);
  });

  it("cleanup-then-apply creates fresh stock for previously expired ingredient", () => {
    const plan = projectUpdatePantry({
      removeExpired: true,
      requireChecked: true,
      todayUtc: "2026-07-12",
      ingredientsById: catalog(chicken),
      pantryRows: [
        {
          id: "p-old",
          ingredientId: "ing-chicken",
          quantity: 0.5,
          unitId: "lb",
          expirationDate: "2020-01-01",
        },
      ],
      checkedGroceries: [
        {
          id: "g-chicken",
          ingredientId: "ing-chicken",
          quantity: 1.5,
          unitId: "lb",
          checked: true,
        },
      ],
    });

    expect(plan.report.expiredRemoved).toHaveLength(1);
    expect(plan.deletePantryIds).toEqual(["p-old"]);
    expect(plan.report.applied[0]).toMatchObject({
      action: "created",
      currentQuantity: null,
      resultingQuantity: 1.5,
    });
    expect(plan.creates).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
  });

  it("without cleanup increases expired stock instead of removing", () => {
    const plan = projectUpdatePantry({
      removeExpired: false,
      requireChecked: true,
      todayUtc: "2026-07-12",
      ingredientsById: catalog(chicken),
      pantryRows: [
        {
          id: "p-old",
          ingredientId: "ing-chicken",
          quantity: 0.5,
          unitId: "lb",
          expirationDate: "2020-01-01",
        },
      ],
      checkedGroceries: [
        {
          id: "g-chicken",
          ingredientId: "ing-chicken",
          quantity: 1,
          unitId: "lb",
          checked: true,
        },
      ],
    });

    expect(plan.report.expiredRemoved).toHaveLength(0);
    expect(plan.report.applied[0]).toMatchObject({
      action: "increased",
      currentQuantity: 0.5,
      resultingQuantity: 1.5,
    });
    expect(plan.updates[0]?.expirationDate).toBe("2020-01-01");
  });

  it("evaluates cap after cleanup removals", () => {
    const pantryRows: PantryManagerPantryRow[] = Array.from({ length: 500 }, (_, i) => ({
      id: `p-${i}`,
      ingredientId: i === 0 ? "ing-chicken" : `ing-filler-${i}`,
      quantity: 1,
      unitId: "lb",
      expirationDate: i === 0 ? "2020-01-01" : null,
    }));
    const ingredientsById = catalog(chicken, oil);
    for (let i = 1; i < 500; i++) {
      ingredientsById.set(`ing-filler-${i}`, {
        id: `ing-filler-${i}`,
        displayName: `Filler ${i}`,
        defaultUnitId: "lb",
      });
    }

    // At 500 with one expired; cleanup frees 1; create oil should fit
    const ok = projectUpdatePantry({
      removeExpired: true,
      requireChecked: true,
      todayUtc: "2026-07-12",
      ingredientsById,
      pantryRows,
      checkedGroceries: [
        {
          id: "g-oil",
          ingredientId: "ing-oil",
          quantity: 1,
          unitId: "tbsp",
          checked: true,
        },
      ],
    });
    expect(ok.creates).toHaveLength(1);

    // Without cleanup, create would exceed 500
    expect(() =>
      projectUpdatePantry({
        removeExpired: false,
        requireChecked: true,
        todayUtc: "2026-07-12",
        ingredientsById,
        pantryRows,
        checkedGroceries: [
          {
            id: "g-oil",
            ingredientId: "ing-oil",
            quantity: 1,
            unitId: "tbsp",
            checked: true,
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: ErrorCode.PANTRY_INVENTORY_FULL }));
  });

  it("preview and confirm projections match for same inputs", () => {
    const args = {
      removeExpired: true,
      todayUtc: "2026-07-12",
      ingredientsById: catalog(oil, chicken),
      pantryRows: [
        {
          id: "p-oil",
          ingredientId: "ing-oil",
          quantity: 1,
          unitId: "tbsp",
          expirationDate: null,
        },
        {
          id: "p-ch",
          ingredientId: "ing-chicken",
          quantity: 1,
          unitId: "lb",
          expirationDate: "2020-01-01",
        },
      ],
      checkedGroceries: [
        {
          id: "g-oil",
          ingredientId: "ing-oil",
          quantity: 2,
          unitId: "tbsp",
          checked: true,
        },
        {
          id: "g-ch",
          ingredientId: "ing-chicken",
          quantity: 1,
          unitId: "lb",
          checked: true,
        },
      ],
    };

    const preview = projectUpdatePantry({ ...args, requireChecked: false });
    const confirm = projectUpdatePantry({ ...args, requireChecked: true });
    expect(preview.report).toEqual(confirm.report);
  });
});
