import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../../src/db/client.js";
import { ErrorCode } from "../../src/domain/errors.js";
import { MAX_PANTRY_ITEMS_PER_HOUSEHOLD } from "../../src/domain/pantry-item.js";
import { GroceryItemService } from "../../src/services/grocery-item-service.js";
import { IngredientService } from "../../src/services/ingredient-service.js";
import { PantryItemService } from "../../src/services/pantry-item-service.js";
import { PantryManagerService } from "../../src/services/pantry-manager-service.js";

describe("update-pantry integration", () => {
  let handle: DbHandle;
  let ingredients: IngredientService;
  let pantry: PantryItemService;
  let grocery: GroceryItemService;
  let manager: PantryManagerService;
  let otherManager: PantryManagerService;
  let otherHouseholdId: string;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-up-"));
    handle = createDb(join(dir, "test.sqlite"));
    runMigrations(handle.sqlite);
    ingredients = new IngredientService(handle.db);
    pantry = new PantryItemService(handle.db);
    grocery = new GroceryItemService(handle.db);
    manager = new PantryManagerService(handle.db);
    otherHouseholdId = randomUUID();
    otherManager = new PantryManagerService(handle.db, otherHouseholdId);
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  function seedOilAndChicken() {
    const oil = ingredients.createIngredient({
      displayName: "Olive oil",
      defaultUnitId: "tbsp",
      shoppingCategoryId: "dry_goods",
    });
    const chicken = ingredients.createIngredient({
      displayName: "Chicken thighs",
      defaultUnitId: "lb",
      shoppingCategoryId: "meat_seafood",
    });
    return { oil, chicken };
  }

  it("confirms create+increase, removes applied groceries, preserves unchecked", () => {
    const { oil, chicken } = seedOilAndChicken();
    pantry.createPantryItem({
      ingredientId: oil.id,
      quantity: 2,
      unitId: "tbsp",
    });
    const gOil = grocery.createGroceryItem({
      ingredientId: oil.id,
      quantity: 3,
      unitId: "tbsp",
    });
    const gChicken = grocery.createGroceryItem({
      ingredientId: chicken.id,
      quantity: 1.5,
      unitId: "lb",
    });
    const gKeep = ingredients.createIngredient({
      displayName: "Salt",
      defaultUnitId: "tsp",
      shoppingCategoryId: "spices",
    });
    const unchecked = grocery.createGroceryItem({
      ingredientId: gKeep.id,
      quantity: 1,
      unitId: "tsp",
    });

    grocery.setGroceryItemChecked(gOil.id, { checked: true });
    grocery.setGroceryItemChecked(gChicken.id, { checked: true });

    const result = manager.confirmUpdatePantry({});
    expect(result.report.appliedCount).toBe(2);
    expect(result.items.find((i) => i.ingredientId === oil.id)?.quantity).toBe(5);
    expect(result.items.find((i) => i.ingredientId === chicken.id)?.quantity).toBe(1.5);
    expect(result.items.find((i) => i.ingredientId === chicken.id)?.expirationDate).toBeNull();

    const list = grocery.listGroceryItems();
    const flat = list.groups.flatMap((g) => g.items);
    expect(flat.map((i) => i.id)).toEqual([unchecked.id]);
    expect(flat[0]?.checked).toBe(false);

    expect(() => manager.confirmUpdatePantry({})).toThrowError(
      expect.objectContaining({ code: ErrorCode.UPDATE_PANTRY_NO_CHECKED }),
    );
  });

  it("preview is read-only and matches confirm", () => {
    const { oil, chicken } = seedOilAndChicken();
    pantry.createPantryItem({
      ingredientId: oil.id,
      quantity: 2,
      unitId: "tbsp",
    });
    const gOil = grocery.createGroceryItem({
      ingredientId: oil.id,
      quantity: 1,
      unitId: "tbsp",
    });
    const gChicken = grocery.createGroceryItem({
      ingredientId: chicken.id,
      quantity: 1,
      unitId: "lb",
    });
    grocery.setGroceryItemChecked(gOil.id, { checked: true });
    grocery.setGroceryItemChecked(gChicken.id, { checked: true });

    const preview = manager.previewUpdatePantry({ removeExpired: false });
    expect(preview.preview.appliedCount).toBe(2);
    expect(pantry.listPantryItems().items).toHaveLength(1);
    expect(grocery.listGroceryItems().groups.flatMap((g) => g.items)).toHaveLength(2);

    const confirm = manager.confirmUpdatePantry({ removeExpired: false });
    expect(confirm.report).toEqual(preview.preview);
  });

  it("zero-checked preview returns empty applied; confirm rejects", () => {
    seedOilAndChicken();
    const preview = manager.previewUpdatePantry({ removeExpired: true });
    expect(preview.preview.applied).toEqual([]);
    expect(() => manager.confirmUpdatePantry({ removeExpired: true })).toThrowError(
      expect.objectContaining({ code: ErrorCode.UPDATE_PANTRY_NO_CHECKED }),
    );
  });

  it("cleanup-then-apply creates fresh stock for expired ingredient", () => {
    const { chicken } = seedOilAndChicken();
    pantry.createPantryItem({
      ingredientId: chicken.id,
      quantity: 0.5,
      unitId: "lb",
      expirationDate: "2020-01-01",
    });
    const g = grocery.createGroceryItem({
      ingredientId: chicken.id,
      quantity: 2,
      unitId: "lb",
    });
    grocery.setGroceryItemChecked(g.id, { checked: true });

    const result = manager.confirmUpdatePantry({ removeExpired: true });
    expect(result.report.expiredRemovedCount).toBe(1);
    expect(result.report.applied[0]?.action).toBe("created");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.quantity).toBe(2);
    expect(result.items[0]?.expirationDate).toBeNull();
  });

  it("unit mismatch fails atomically", () => {
    const { oil } = seedOilAndChicken();
    const g = grocery.createGroceryItem({
      ingredientId: oil.id,
      quantity: 1,
      unitId: "tbsp",
    });
    grocery.setGroceryItemChecked(g.id, { checked: true });
    // Force bad unit via direct DB update
    handle.sqlite.prepare(`UPDATE grocery_items SET unit_id = ? WHERE id = ?`).run("cup", g.id);

    expect(() => manager.confirmUpdatePantry({})).toThrowError(
      expect.objectContaining({ code: ErrorCode.UNIT_MISMATCH }),
    );
    expect(grocery.getGroceryItem(g.id).checked).toBe(true);
    expect(pantry.listPantryItems().items).toHaveLength(0);
  });

  it("pantry inventory full fails atomically without cleanup room", () => {
    const { oil } = seedOilAndChicken();
    const householdId = "00000000-0000-4000-8000-000000000001";
    const now = new Date().toISOString();
    const insertIng = handle.sqlite.prepare(
      `INSERT INTO ingredients (id, household_id, display_name, display_name_key, default_unit_id, shopping_category_id, aliases_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'tbsp', 'other', '[]', ?, ?)`,
    );
    const insertPantry = handle.sqlite.prepare(
      `INSERT INTO pantry_items (id, household_id, ingredient_id, quantity, unit_id, expiration_date, created_at, updated_at)
       VALUES (?, ?, ?, 1, 'tbsp', NULL, ?, ?)`,
    );
    for (let i = 0; i < MAX_PANTRY_ITEMS_PER_HOUSEHOLD; i++) {
      const ingId = randomUUID();
      insertIng.run(ingId, householdId, `Filler ${i}`, `filler ${i}`, now, now);
      insertPantry.run(randomUUID(), householdId, ingId, now, now);
    }

    const g = grocery.createGroceryItem({
      ingredientId: oil.id,
      quantity: 1,
      unitId: "tbsp",
    });
    grocery.setGroceryItemChecked(g.id, { checked: true });

    expect(() => manager.confirmUpdatePantry({})).toThrowError(
      expect.objectContaining({ code: ErrorCode.PANTRY_INVENTORY_FULL }),
    );
    expect(grocery.getGroceryItem(g.id).checked).toBe(true);
  });

  it("does not affect another household", () => {
    const { oil } = seedOilAndChicken();
    const g = grocery.createGroceryItem({
      ingredientId: oil.id,
      quantity: 1,
      unitId: "tbsp",
    });
    grocery.setGroceryItemChecked(g.id, { checked: true });

    expect(() => otherManager.confirmUpdatePantry({})).toThrowError(
      expect.objectContaining({ code: ErrorCode.UPDATE_PANTRY_NO_CHECKED }),
    );
    manager.confirmUpdatePantry({});
    expect(pantry.listPantryItems().items).toHaveLength(1);
  });
});
