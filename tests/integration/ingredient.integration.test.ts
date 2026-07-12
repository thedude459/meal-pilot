import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../../src/db/client.js";
import { ErrorCode } from "../../src/domain/errors.js";
import { MAX_INGREDIENTS_PER_HOUSEHOLD } from "../../src/domain/ingredient.js";
import { IngredientService } from "../../src/services/ingredient-service.js";

const minimal = {
  displayName: "  Olive   oil  ",
  defaultUnitId: "tbsp",
  shoppingCategoryId: "dry_goods",
  aliases: ["EVOO", "evoo", "extra virgin olive oil"],
};

describe("ingredient integration", () => {
  let handle: DbHandle;
  let service: IngredientService;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-ingredient-"));
    handle = createDb(join(dir, "test.sqlite"));
    runMigrations(handle.sqlite);
    service = new IngredientService(handle.db);
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it("createIngredient normalizes and persists", () => {
    const created = service.createIngredient(minimal);
    expect(created.displayName).toBe("Olive oil");
    expect(created.defaultUnitId).toBe("tbsp");
    expect(created.shoppingCategoryId).toBe("dry_goods");
    expect(created.aliases).toEqual(["EVOO", "extra virgin olive oil"]);
    expect(service.getIngredient(created.id)).toEqual(created);
  });

  it("rejects unknown unit and leaves catalog empty", () => {
    try {
      service.createIngredient({ displayName: "Flour", defaultUnitId: "not_a_unit" });
      expect.fail("expected UNKNOWN_UNIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNKNOWN_UNIT);
    }
    expect(service.listIngredients().items).toHaveLength(0);
  });

  it("rejects unknown shopping category and leaves catalog empty", () => {
    try {
      service.createIngredient({
        displayName: "Flour",
        defaultUnitId: "cup",
        shoppingCategoryId: "not_a_category",
      });
      expect.fail("expected UNKNOWN_SHOPPING_CATEGORY");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNKNOWN_SHOPPING_CATEGORY);
    }
    expect(service.listIngredients().items).toHaveLength(0);
  });

  it("rejects duplicate normalized display name", () => {
    service.createIngredient(minimal);
    try {
      service.createIngredient({ displayName: "olive oil", defaultUnitId: "cup" });
      expect.fail("expected INGREDIENT_LABEL_CONFLICT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.INGREDIENT_LABEL_CONFLICT);
      expect((err as { status: number }).status).toBe(409);
    }
    expect(service.listIngredients().items).toHaveLength(1);
  });

  it("lists empty catalog and A–Z order", () => {
    expect(service.listIngredients()).toEqual({
      items: [],
      maxIngredients: MAX_INGREDIENTS_PER_HOUSEHOLD,
    });
    service.createIngredient({ displayName: "Zucchini", defaultUnitId: "piece" });
    service.createIngredient({ displayName: "apple", defaultUnitId: "piece" });
    service.createIngredient({ displayName: "Banana", defaultUnitId: "piece" });
    expect(service.listIngredients().items.map((i) => i.displayName)).toEqual([
      "apple",
      "Banana",
      "Zucchini",
    ]);
  });

  it("replace clears category and aliases; omit fields rejected at Zod layer via service require", () => {
    const created = service.createIngredient(minimal);
    const replaced = service.replaceIngredient(created.id, {
      displayName: "Olive oil",
      defaultUnitId: "tbsp",
      shoppingCategoryId: null,
      aliases: [],
    });
    expect(replaced.shoppingCategoryId).toBeNull();
    expect(replaced.aliases).toEqual([]);
    expect(replaced.id).toBe(created.id);

    try {
      service.replaceIngredient(created.id, {
        displayName: "",
        defaultUnitId: "tbsp",
        shoppingCategoryId: null,
        aliases: [],
      });
      expect.fail("expected validation");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    expect(service.getIngredient(created.id).displayName).toBe("Olive oil");
  });

  it("deleteIngredient permanently removes", () => {
    const created = service.createIngredient(minimal);
    service.deleteIngredient(created.id);
    expect(service.listIngredients().items).toHaveLength(0);
    try {
      service.deleteIngredient(created.id);
      expect.fail("expected NOT_FOUND");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it("preserves alias order and rejects cross-ingredient alias collision", () => {
    const a = service.createIngredient({
      displayName: "Scallion",
      defaultUnitId: "piece",
      aliases: ["green onion", "spring onion"],
    });
    expect(service.getIngredient(a.id).aliases).toEqual(["green onion", "spring onion"]);

    try {
      service.createIngredient({
        displayName: "Shallot",
        defaultUnitId: "piece",
        aliases: ["Green Onion"],
      });
      expect.fail("expected INGREDIENT_LABEL_CONFLICT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.INGREDIENT_LABEL_CONFLICT);
    }
    expect(service.listIngredients().items).toHaveLength(1);
  });

  it("isolates ingredients across households", () => {
    const householdB = "00000000-0000-4000-8000-000000000099";
    handle.sqlite.prepare("INSERT INTO households (id) VALUES (?)").run(householdB);
    const serviceB = new IngredientService(handle.db, householdB);

    const inA = service.createIngredient(minimal);
    const inB = serviceB.createIngredient({
      displayName: "Rice",
      defaultUnitId: "cup",
    });

    expect(service.listIngredients().items.map((i) => i.id)).toEqual([inA.id]);
    expect(serviceB.listIngredients().items.map((i) => i.id)).toEqual([inB.id]);
    try {
      service.getIngredient(inB.id);
      expect.fail("expected NOT_FOUND");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it("rejects create when catalog already has 500 ingredients", () => {
    const now = new Date().toISOString();
    const insert = handle.sqlite.prepare(`
      INSERT INTO ingredients (
        id, household_id, display_name, display_name_key, default_unit_id,
        shopping_category_id, aliases_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'cup', NULL, '[]', ?, ?)
    `);
    handle.sqlite.exec("BEGIN");
    for (let i = 0; i < MAX_INGREDIENTS_PER_HOUSEHOLD; i++) {
      const name = `Item ${i}`;
      insert.run(
        `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        "00000000-0000-4000-8000-000000000001",
        name,
        name.toLocaleLowerCase("en-US"),
        now,
        now,
      );
    }
    handle.sqlite.exec("COMMIT");

    expect(service.listIngredients().items).toHaveLength(MAX_INGREDIENTS_PER_HOUSEHOLD);
    try {
      service.createIngredient(minimal);
      expect.fail("expected INGREDIENT_CATALOG_FULL");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.INGREDIENT_CATALOG_FULL);
      expect((err as { status: number }).status).toBe(409);
    }
    expect(service.listIngredients().items).toHaveLength(MAX_INGREDIENTS_PER_HOUSEHOLD);
  });
});
