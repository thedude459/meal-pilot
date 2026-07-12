import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../../src/db/client.js";
import { ErrorCode } from "../../src/domain/errors.js";
import { GroceryItemService } from "../../src/services/grocery-item-service.js";
import { GroceryListBuilderService } from "../../src/services/grocery-list-builder-service.js";
import { IngredientService } from "../../src/services/ingredient-service.js";
import { PantryItemService } from "../../src/services/pantry-item-service.js";
import { RecipeService } from "../../src/services/recipe-service.js";
import { WeeklyPlanService } from "../../src/services/weekly-plan-service.js";

describe("build-grocery-list integration", () => {
  let handle: DbHandle;
  let ingredients: IngredientService;
  let recipes: RecipeService;
  let pantry: PantryItemService;
  let grocery: GroceryItemService;
  let plans: WeeklyPlanService;
  let builder: GroceryListBuilderService;
  let otherBuilder: GroceryListBuilderService;
  let otherHouseholdId: string;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-bgl-"));
    handle = createDb(join(dir, "test.sqlite"));
    runMigrations(handle.sqlite);
    ingredients = new IngredientService(handle.db);
    recipes = new RecipeService(handle.db);
    pantry = new PantryItemService(handle.db);
    grocery = new GroceryItemService(handle.db);
    plans = new WeeklyPlanService(handle.db);
    builder = new GroceryListBuilderService(handle.db);
    otherHouseholdId = randomUUID();
    otherBuilder = new GroceryListBuilderService(handle.db, otherHouseholdId);
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  function seedCatalog() {
    const chicken = ingredients.createIngredient({
      displayName: "Chicken thighs",
      defaultUnitId: "lb",
      shoppingCategoryId: "meat_seafood",
    });
    const oil = ingredients.createIngredient({
      displayName: "Olive oil",
      defaultUnitId: "tbsp",
      shoppingCategoryId: "dry_goods",
      aliases: ["EVOO"],
    });
    return { chicken, oil };
  }

  function seedPlanWithApproved(week = "2026-07-13") {
    const { chicken, oil } = seedCatalog();
    const r1 = recipes.createRecipe({
      title: "Sheet-pan chicken",
      ingredients: [
        { name: "Chicken thighs", quantity: 1.5, unitId: "lb" },
        { name: "Olive oil", quantity: 2, unitId: "tbsp" },
      ],
      instructionSteps: ["Roast."],
    });
    const r2 = recipes.createRecipe({
      title: "Garlic chicken",
      ingredients: [
        { name: "Chicken thighs", quantity: 1, unitId: "lb" },
        { name: "Mystery spice", quantity: 1, unitId: "tsp" },
      ],
      instructionSteps: ["Cook."],
    });
    pantry.createPantryItem({
      ingredientId: oil.id,
      quantity: 1,
      unitId: "tbsp",
    });
    const plan = plans.createWeeklyPlan({
      weekStartDate: week,
      slots: [
        { day: "monday", recipeId: r1.id },
        { day: "tuesday", recipeId: r2.id },
      ],
    });
    plans.setSlotStatus(plan.id, "monday", "approved");
    plans.setSlotStatus(plan.id, "tuesday", "approved");
    return { chicken, oil, plan, r1, r2 };
  }

  it("builds from approved meals only, merges, subtracts pantry, reports unmatched", () => {
    const { chicken, oil, plan } = seedPlanWithApproved();
    plans.setSlotStatus(plan.id, "tuesday", "pending");

    const result = builder.buildGroceryList({ weekStartDate: "2026-07-13" });
    const items = result.groups.flatMap((g) => g.items);
    const chickenLine = items.find((i) => i.ingredientId === chicken.id);
    const oilLine = items.find((i) => i.ingredientId === oil.id);

    expect(chickenLine?.quantity).toBe(1.5);
    expect(oilLine?.quantity).toBe(1);
    expect(result.report.approvedSlotCount).toBe(1);
    expect(result.report.unmatched).toHaveLength(0);

    plans.setSlotStatus(plan.id, "tuesday", "approved");
    const rebuilt = builder.buildGroceryList({ weekStartDate: "2026-07-13" });
    const chicken2 = rebuilt.groups
      .flatMap((g) => g.items)
      .find((i) => i.ingredientId === chicken.id);
    expect(chicken2?.quantity).toBe(2.5);
    expect(rebuilt.report.unmatched.some((u) => u.ingredientName === "Mystery spice")).toBe(
      true,
    );
  });

  it("rejects non-Monday, missing plan, zero approved", () => {
    seedPlanWithApproved();
    try {
      builder.buildGroceryList({ weekStartDate: "2026-07-14" });
      expect.fail("expected validation");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    try {
      builder.buildGroceryList({ weekStartDate: "2026-07-20" });
      expect.fail("expected not found");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }

    const empty = plans.createWeeklyPlan({ weekStartDate: "2026-07-06" });
    try {
      builder.buildGroceryList({ weekStartDate: empty.weekStartDate });
      expect.fail("expected no approved");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.BUILD_NO_APPROVED_MEALS);
    }
  });

  it("preserves checked lines and reports remaining shortfall", () => {
    const { chicken } = seedPlanWithApproved();
    builder.buildGroceryList({ weekStartDate: "2026-07-13" });
    const line = grocery
      .listGroceryItems()
      .groups.flatMap((g) => g.items)
      .find((i) => i.ingredientId === chicken.id)!;
    grocery.replaceGroceryItem(line.id, { quantity: 1, unitId: "lb" });
    grocery.setGroceryItemChecked(line.id, { checked: true });

    const rebuilt = builder.buildGroceryList({ weekStartDate: "2026-07-13" });
    const after = rebuilt.groups
      .flatMap((g) => g.items)
      .find((i) => i.ingredientId === chicken.id)!;
    expect(after.checked).toBe(true);
    expect(after.quantity).toBe(1);
    expect(rebuilt.report.checkedSkips[0]?.remainingShortfall).toBeGreaterThan(0);
  });

  it("leaves manual out-of-set unchecked; removes pantry-covered merged unchecked", () => {
    const { chicken, oil } = seedPlanWithApproved();
    const paper = ingredients.createIngredient({
      displayName: "Paper towels",
      defaultUnitId: "piece",
      shoppingCategoryId: "other",
    });
    grocery.createGroceryItem({
      ingredientId: paper.id,
      quantity: 1,
      unitId: "piece",
    });
    builder.buildGroceryList({ weekStartDate: "2026-07-13" });

    pantry.replacePantryItem(
      pantry.listPantryItems().items.find((p) => p.ingredientId === oil.id)!.id,
      { quantity: 10, unitId: "tbsp", expirationDate: null },
    );
    const rebuilt = builder.buildGroceryList({ weekStartDate: "2026-07-13" });
    const ids = rebuilt.groups.flatMap((g) => g.items).map((i) => i.ingredientId);
    expect(ids).toContain(paper.id);
    expect(ids).toContain(chicken.id);
    expect(ids).not.toContain(oil.id);
  });

  it("ignores expired pantry stock", () => {
    const { oil } = seedPlanWithApproved();
    const pantryRow = pantry.listPantryItems().items.find((p) => p.ingredientId === oil.id)!;
    pantry.replacePantryItem(pantryRow.id, {
      quantity: 100,
      unitId: "tbsp",
      expirationDate: "2000-01-01",
    });
    const result = builder.buildGroceryList({ weekStartDate: "2026-07-13" });
    const oilLine = result.groups
      .flatMap((g) => g.items)
      .find((i) => i.ingredientId === oil.id);
    expect(oilLine?.quantity).toBe(2);
  });

  it("does not leak across households", () => {
    seedPlanWithApproved();
    try {
      otherBuilder.buildGroceryList({ weekStartDate: "2026-07-13" });
      expect.fail("expected not found");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it("grocery check/replace still work after build", () => {
    const { chicken } = seedPlanWithApproved();
    builder.buildGroceryList({ weekStartDate: "2026-07-13" });
    const line = grocery
      .listGroceryItems()
      .groups.flatMap((g) => g.items)
      .find((i) => i.ingredientId === chicken.id)!;
    grocery.replaceGroceryItem(line.id, { quantity: 3, unitId: "lb" });
    grocery.setGroceryItemChecked(line.id, { checked: true });
    const updated = grocery.getGroceryItem(line.id);
    expect(updated.quantity).toBe(3);
    expect(updated.checked).toBe(true);
  });
});
