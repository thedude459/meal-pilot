import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../../src/db/client.js";
import { ErrorCode } from "../../src/domain/errors.js";
import { MAX_PANTRY_ITEMS_PER_HOUSEHOLD } from "../../src/domain/pantry-item.js";
import { IngredientService } from "../../src/services/ingredient-service.js";
import { PantryItemService } from "../../src/services/pantry-item-service.js";
import { randomUUID } from "node:crypto";

describe("pantry-item integration", () => {
  let handle: DbHandle;
  let ingredients: IngredientService;
  let pantry: PantryItemService;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-pantry-"));
    handle = createDb(join(dir, "test.sqlite"));
    runMigrations(handle.sqlite);
    ingredients = new IngredientService(handle.db);
    pantry = new PantryItemService(handle.db);
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  function seedIngredient(name: string, unit = "tbsp") {
    return ingredients.createIngredient({
      displayName: name,
      defaultUnitId: unit,
      shoppingCategoryId: null,
      aliases: [],
    });
  }

  it("createPantryItem persists quantity, unit, past expiration, and display name", () => {
    const ing = seedIngredient("Olive oil");
    const created = pantry.createPantryItem({
      ingredientId: ing.id,
      quantity: 12.5555,
      unitId: "tbsp",
      expirationDate: "2020-06-01",
    });
    expect(created.quantity).toBe(12.556);
    expect(created.unitId).toBe("tbsp");
    expect(created.expirationDate).toBe("2020-06-01");
    expect(created.ingredientDisplayName).toBe("Olive oil");
    expect(pantry.getPantryItem(created.id)).toEqual(created);
  });

  it("rejects unknown Ingredient with NOT_FOUND", () => {
    try {
      pantry.createPantryItem({
        ingredientId: randomUUID(),
        quantity: 1,
        unitId: "tbsp",
      });
      expect.fail("expected NOT_FOUND");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
    expect(pantry.listPantryItems().items).toHaveLength(0);
  });

  it("rejects UNIT_MISMATCH and PANTRY_LIMIT without creating rows", () => {
    const ing = seedIngredient("Flour", "cup");
    try {
      pantry.createPantryItem({ ingredientId: ing.id, quantity: 1, unitId: "tbsp" });
      expect.fail("expected UNIT_MISMATCH");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNIT_MISMATCH);
    }
    try {
      pantry.createPantryItem({ ingredientId: ing.id, quantity: 0, unitId: "cup" });
      expect.fail("expected PANTRY_LIMIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.PANTRY_LIMIT);
    }
    expect(pantry.listPantryItems().items).toHaveLength(0);
  });

  it("rejects duplicate Ingredient stock", () => {
    const ing = seedIngredient("Salt");
    pantry.createPantryItem({ ingredientId: ing.id, quantity: 1, unitId: "tbsp" });
    try {
      pantry.createPantryItem({ ingredientId: ing.id, quantity: 2, unitId: "tbsp" });
      expect.fail("expected PANTRY_INGREDIENT_CONFLICT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.PANTRY_INGREDIENT_CONFLICT);
      expect((err as { status: number }).status).toBe(409);
    }
    expect(pantry.listPantryItems().items).toHaveLength(1);
  });

  it("enforces inventory cap of 500", () => {
    for (let i = 0; i < MAX_PANTRY_ITEMS_PER_HOUSEHOLD; i++) {
      const ing = seedIngredient(`Item ${i}`, "piece");
      pantry.createPantryItem({ ingredientId: ing.id, quantity: 1, unitId: "piece" });
    }
    // Ingredient catalog is also capped at 500 — insert overflow Ingredient via SQL
    const overflowId = randomUUID();
    const now = new Date().toISOString();
    handle.sqlite
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
      pantry.createPantryItem({ ingredientId: overflowId, quantity: 1, unitId: "piece" });
      expect.fail("expected PANTRY_INVENTORY_FULL");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.PANTRY_INVENTORY_FULL);
      expect((err as { status: number }).status).toBe(409);
    }
    expect(pantry.listPantryItems().items).toHaveLength(MAX_PANTRY_ITEMS_PER_HOUSEHOLD);
  }, 60_000);

  it("lists empty and A–Z by ingredient display name; get detail", () => {
    expect(pantry.listPantryItems()).toEqual({
      items: [],
      maxPantryItems: MAX_PANTRY_ITEMS_PER_HOUSEHOLD,
    });
    const z = seedIngredient("Zucchini", "piece");
    const a = seedIngredient("apple", "piece");
    const b = seedIngredient("Banana", "piece");
    pantry.createPantryItem({ ingredientId: z.id, quantity: 1, unitId: "piece" });
    pantry.createPantryItem({ ingredientId: a.id, quantity: 2, unitId: "piece" });
    pantry.createPantryItem({ ingredientId: b.id, quantity: 3, unitId: "piece" });
    expect(pantry.listPantryItems().items.map((i) => i.ingredientDisplayName)).toEqual([
      "apple",
      "Banana",
      "Zucchini",
    ]);
  });

  it("replace clears expiration; omit fields and ingredientId rejected; prior unchanged", () => {
    const ing = seedIngredient("Milk", "cup");
    const created = pantry.createPantryItem({
      ingredientId: ing.id,
      quantity: 2,
      unitId: "cup",
      expirationDate: "2026-08-01",
    });
    const replaced = pantry.replacePantryItem(created.id, {
      quantity: 1.5,
      unitId: "cup",
      expirationDate: null,
    });
    expect(replaced.quantity).toBe(1.5);
    expect(replaced.expirationDate).toBeNull();
    expect(replaced.id).toBe(created.id);

    try {
      pantry.replacePantryItem(created.id, {
        quantity: 1,
        unitId: "cup",
        expirationDate: null,
        ingredientId: ing.id,
      } as never);
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    expect(pantry.getPantryItem(created.id).quantity).toBe(1.5);

    try {
      pantry.replacePantryItem(created.id, {
        quantity: 1,
        unitId: "tbsp",
        expirationDate: null,
      });
      expect.fail("expected UNIT_MISMATCH");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNIT_MISMATCH);
    }
    expect(pantry.getPantryItem(created.id).unitId).toBe("cup");
  });

  it("stale unit after Ingredient defaultUnitId change → UNIT_MISMATCH", () => {
    const ing = seedIngredient("Rice", "cup");
    const item = pantry.createPantryItem({
      ingredientId: ing.id,
      quantity: 2,
      unitId: "cup",
    });
    ingredients.replaceIngredient(ing.id, {
      displayName: "Rice",
      defaultUnitId: "g",
      shoppingCategoryId: null,
      aliases: [],
    });
    try {
      pantry.replacePantryItem(item.id, {
        quantity: 2,
        unitId: "cup",
        expirationDate: null,
      });
      expect.fail("expected UNIT_MISMATCH");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNIT_MISMATCH);
    }
    expect(pantry.getPantryItem(item.id).unitId).toBe("cup");
    const updated = pantry.replacePantryItem(item.id, {
      quantity: 500,
      unitId: "g",
      expirationDate: null,
    });
    expect(updated.unitId).toBe("g");
    expect(updated.quantity).toBe(500);
  });

  it("delete pantry; Ingredient-in-use block; then Ingredient delete succeeds", () => {
    const ing = seedIngredient("Butter");
    const item = pantry.createPantryItem({
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
    expect(pantry.getPantryItem(item.id).ingredientId).toBe(ing.id);

    pantry.deletePantryItem(item.id);
    try {
      pantry.getPantryItem(item.id);
      expect.fail("expected NOT_FOUND");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
    ingredients.deleteIngredient(ing.id);
    expect(ingredients.listIngredients().items).toHaveLength(0);
  });

  it("surfaces past and null expirations without auto-delete", () => {
    const pastIng = seedIngredient("Yogurt", "cup");
    const noneIng = seedIngredient("Flour", "cup");
    pantry.createPantryItem({
      ingredientId: pastIng.id,
      quantity: 1,
      unitId: "cup",
      expirationDate: "2019-01-01",
    });
    pantry.createPantryItem({
      ingredientId: noneIng.id,
      quantity: 2,
      unitId: "cup",
    });
    const items = pantry.listPantryItems().items;
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.ingredientDisplayName === "Yogurt")?.expirationDate).toBe(
      "2019-01-01",
    );
    expect(items.find((i) => i.ingredientDisplayName === "Flour")?.expirationDate).toBeNull();
  });

  it("isolates pantry by householdId", () => {
    const householdB = randomUUID();
    handle.sqlite.prepare("INSERT INTO households (id) VALUES (?)").run(householdB);
    const pantryB = new PantryItemService(handle.db, householdB);
    const ingredientsB = new IngredientService(handle.db, householdB);

    const ingA = seedIngredient("Shared name A");
    pantry.createPantryItem({ ingredientId: ingA.id, quantity: 1, unitId: "tbsp" });

    const ingB = ingredientsB.createIngredient({
      displayName: "Shared name B",
      defaultUnitId: "tbsp",
      shoppingCategoryId: null,
      aliases: [],
    });
    pantryB.createPantryItem({ ingredientId: ingB.id, quantity: 9, unitId: "tbsp" });

    expect(pantry.listPantryItems().items).toHaveLength(1);
    expect(pantry.listPantryItems().items[0]?.quantity).toBe(1);
    expect(pantryB.listPantryItems().items).toHaveLength(1);
    expect(pantryB.listPantryItems().items[0]?.quantity).toBe(9);
  });
});
