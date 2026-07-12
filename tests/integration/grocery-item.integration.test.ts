import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../../src/db/client.js";
import { ErrorCode } from "../../src/domain/errors.js";
import { MAX_GROCERY_ITEMS_PER_HOUSEHOLD } from "../../src/domain/grocery-item.js";
import { GroceryItemService } from "../../src/services/grocery-item-service.js";
import { IngredientService } from "../../src/services/ingredient-service.js";

describe("grocery-item integration", () => {
  let handle: DbHandle;
  let ingredients: IngredientService;
  let grocery: GroceryItemService;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-grocery-"));
    handle = createDb(join(dir, "test.sqlite"));
    runMigrations(handle.sqlite);
    ingredients = new IngredientService(handle.db);
    grocery = new GroceryItemService(handle.db);
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  function seedIngredient(
    name: string,
    unit = "tbsp",
    shoppingCategoryId: string | null = null,
  ) {
    return ingredients.createIngredient({
      displayName: name,
      defaultUnitId: unit,
      shoppingCategoryId,
      aliases: [],
    });
  }

  it("createGroceryItem persists fields and starts unchecked", () => {
    const ing = seedIngredient("Olive oil", "tbsp", "dry_goods");
    const created = grocery.createGroceryItem({
      ingredientId: ing.id,
      quantity: 2.5555,
      unitId: "tbsp",
    });
    expect(created.quantity).toBe(2.556);
    expect(created.unitId).toBe("tbsp");
    expect(created.checked).toBe(false);
    expect(created.ingredientDisplayName).toBe("Olive oil");
    expect(created.shoppingCategoryId).toBe("dry_goods");
    expect(created.shoppingCategoryLabel).toBe("Dry goods");
    expect(grocery.getGroceryItem(created.id)).toEqual(created);
  });

  it("rejects unknown Ingredient, UNIT_MISMATCH, GROCERY_LIMIT, and checked on create", () => {
    const ing = seedIngredient("Flour", "cup");
    try {
      grocery.createGroceryItem({
        ingredientId: randomUUID(),
        quantity: 1,
        unitId: "cup",
      });
      expect.fail("expected NOT_FOUND");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
    try {
      grocery.createGroceryItem({ ingredientId: ing.id, quantity: 1, unitId: "tbsp" });
      expect.fail("expected UNIT_MISMATCH");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNIT_MISMATCH);
    }
    try {
      grocery.createGroceryItem({ ingredientId: ing.id, quantity: 0, unitId: "cup" });
      expect.fail("expected GROCERY_LIMIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.GROCERY_LIMIT);
    }
    try {
      grocery.createGroceryItem({
        ingredientId: ing.id,
        quantity: 1,
        unitId: "cup",
        checked: true,
      });
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    expect(grocery.listGroceryItems().groups).toHaveLength(0);
  });

  it("rejects duplicate Ingredient line and list full at 500", () => {
    const ing = seedIngredient("Salt");
    grocery.createGroceryItem({ ingredientId: ing.id, quantity: 1, unitId: "tbsp" });
    try {
      grocery.createGroceryItem({ ingredientId: ing.id, quantity: 2, unitId: "tbsp" });
      expect.fail("expected GROCERY_INGREDIENT_CONFLICT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.GROCERY_INGREDIENT_CONFLICT);
      expect((err as { status: number }).status).toBe(409);
    }

    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-grocery-full-"));
    const fullHandle = createDb(join(dir, "test.sqlite"));
    runMigrations(fullHandle.sqlite);
    const fullIngredients = new IngredientService(fullHandle.db);
    const fullGrocery = new GroceryItemService(fullHandle.db);
    for (let i = 0; i < MAX_GROCERY_ITEMS_PER_HOUSEHOLD; i++) {
      const item = fullIngredients.createIngredient({
        displayName: `Item ${i}`,
        defaultUnitId: "piece",
        shoppingCategoryId: null,
        aliases: [],
      });
      fullGrocery.createGroceryItem({
        ingredientId: item.id,
        quantity: 1,
        unitId: "piece",
      });
    }
    const overflowId = randomUUID();
    const now = new Date().toISOString();
    fullHandle.sqlite
      .prepare(
        `INSERT INTO ingredients (
          id, household_id, display_name, display_name_key, default_unit_id,
          shopping_category_id, aliases_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, '[]', ?, ?)`,
      )
      .run(
        overflowId,
        "00000000-0000-4000-8000-000000000001",
        "Overflow",
        "overflow",
        "piece",
        now,
        now,
      );
    try {
      fullGrocery.createGroceryItem({
        ingredientId: overflowId,
        quantity: 1,
        unitId: "piece",
      });
      expect.fail("expected GROCERY_LIST_FULL");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.GROCERY_LIST_FULL);
    }
    const total = fullGrocery
      .listGroceryItems()
      .groups.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(MAX_GROCERY_ITEMS_PER_HOUSEHOLD);
    fullHandle.sqlite.close();
  });

  it("lists empty groups and catalog-ordered groups with Other last", () => {
    expect(grocery.listGroceryItems()).toEqual({ groups: [], maxGroceryItems: 500 });

    const milk = seedIngredient("Milk", "cup", "dairy");
    const oil = seedIngredient("Olive oil", "tbsp", "dry_goods");
    const mystery = seedIngredient("Mystery spice", "tsp", null);
    grocery.createGroceryItem({ ingredientId: oil.id, quantity: 1, unitId: "tbsp" });
    grocery.createGroceryItem({ ingredientId: milk.id, quantity: 1, unitId: "cup" });
    grocery.createGroceryItem({ ingredientId: mystery.id, quantity: 1, unitId: "tsp" });

    const { groups } = grocery.listGroceryItems();
    expect(groups.map((g) => g.shoppingCategoryId)).toEqual([
      "dairy",
      "dry_goods",
      "other",
    ]);
  });

  it("replace updates quantity/unit without changing checked; rejects checked/ingredientId", () => {
    const ing = seedIngredient("Butter", "tbsp", "dairy");
    const created = grocery.createGroceryItem({
      ingredientId: ing.id,
      quantity: 1,
      unitId: "tbsp",
    });
    grocery.setGroceryItemChecked(created.id, { checked: true });
    const replaced = grocery.replaceGroceryItem(created.id, {
      quantity: 3,
      unitId: "tbsp",
    });
    expect(replaced.quantity).toBe(3);
    expect(replaced.checked).toBe(true);
    try {
      grocery.replaceGroceryItem(created.id, {
        quantity: 2,
        unitId: "tbsp",
        checked: false,
      });
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    expect(grocery.getGroceryItem(created.id).checked).toBe(true);
  });

  it("rejects UNIT_MISMATCH on replace after Ingredient default unit change", () => {
    const ing = seedIngredient("Rice", "cup");
    const created = grocery.createGroceryItem({
      ingredientId: ing.id,
      quantity: 1,
      unitId: "cup",
    });
    ingredients.replaceIngredient(ing.id, {
      displayName: "Rice",
      defaultUnitId: "tbsp",
      shoppingCategoryId: null,
      aliases: [],
    });
    try {
      grocery.replaceGroceryItem(created.id, { quantity: 2, unitId: "cup" });
      expect.fail("expected UNIT_MISMATCH");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNIT_MISMATCH);
    }
    expect(grocery.getGroceryItem(created.id).quantity).toBe(1);
  });

  it("deletes grocery item and blocks Ingredient delete while listed", () => {
    const ing = seedIngredient("Pasta");
    const created = grocery.createGroceryItem({
      ingredientId: ing.id,
      quantity: 1,
      unitId: "tbsp",
    });
    try {
      ingredients.deleteIngredient(ing.id);
      expect.fail("expected INGREDIENT_IN_USE");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.INGREDIENT_IN_USE);
      expect((err as { status: number }).status).toBe(409);
    }
    grocery.deleteGroceryItem(created.id);
    expect(() => grocery.getGroceryItem(created.id)).toThrow();
    ingredients.deleteIngredient(ing.id);
  });

  it("check toggle changes only checked; list order ignores checked; household isolation", () => {
    const a = seedIngredient("Apple", "piece", "produce");
    const z = seedIngredient("Zucchini", "piece", "produce");
    const apple = grocery.createGroceryItem({
      ingredientId: a.id,
      quantity: 1,
      unitId: "piece",
    });
    grocery.createGroceryItem({ ingredientId: z.id, quantity: 1, unitId: "piece" });
    grocery.setGroceryItemChecked(apple.id, { checked: true });
    const names = grocery
      .listGroceryItems()
      .groups[0]!.items.map((i) => i.ingredientDisplayName);
    expect(names).toEqual(["Apple", "Zucchini"]);
    expect(grocery.getGroceryItem(apple.id).checked).toBe(true);
    expect(grocery.getGroceryItem(apple.id).quantity).toBe(1);
    grocery.setGroceryItemChecked(apple.id, { checked: false });
    expect(grocery.getGroceryItem(apple.id).checked).toBe(false);

    const otherHousehold = randomUUID();
    handle.sqlite
      .prepare(`INSERT INTO households (id, created_at) VALUES (?, ?)`)
      .run(otherHousehold, new Date().toISOString());
    const other = new GroceryItemService(handle.db, otherHousehold);
    expect(other.listGroceryItems().groups).toHaveLength(0);
  });
});
