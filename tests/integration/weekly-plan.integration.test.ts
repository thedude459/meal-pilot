import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../../src/db/client.js";
import { ErrorCode } from "../../src/domain/errors.js";
import { MAX_WEEKLY_PLANS_PER_HOUSEHOLD } from "../../src/domain/weekly-plan.js";
import { RecipeService } from "../../src/services/recipe-service.js";
import { WeeklyPlanService } from "../../src/services/weekly-plan-service.js";

describe("weekly-plan integration", () => {
  let handle: DbHandle;
  let recipes: RecipeService;
  let plans: WeeklyPlanService;
  let otherHousehold: WeeklyPlanService;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-weekly-"));
    handle = createDb(join(dir, "test.sqlite"));
    runMigrations(handle.sqlite);
    recipes = new RecipeService(handle.db);
    plans = new WeeklyPlanService(handle.db);
    otherHousehold = new WeeklyPlanService(handle.db, randomUUID());
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  function seedRecipe(title = "Sheet-pan chicken") {
    return recipes.createRecipe({
      title,
      ingredients: [{ name: "Chicken", quantity: 1, unitId: "lb" }],
      instructionSteps: ["Roast until done."],
    });
  }

  /** Return a Monday ISO date N weeks before or after a known Monday. */
  function mondayOffset(weeksFromBase: number, base = "2026-07-13"): string {
    const [y, m, d] = base.split("-").map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d));
    utc.setUTCDate(utc.getUTCDate() + weeksFromBase * 7);
    return utc.toISOString().slice(0, 10);
  }

  it("createWeeklyPlan empty and with slots; slots start pending; same Recipe twice; past Monday OK", () => {
    const recipe = seedRecipe();
    const empty = plans.createWeeklyPlan({ weekStartDate: "2026-07-13" });
    expect(empty.slots).toHaveLength(7);
    expect(empty.slots.every((s) => s.recipeId === null && s.status === null)).toBe(true);

    const pastMonday = mondayOffset(-52);
    const past = plans.createWeeklyPlan({ weekStartDate: pastMonday });
    expect(past.weekStartDate).toBe(pastMonday);

    const withSlots = plans.createWeeklyPlan({
      weekStartDate: "2026-07-20",
      slots: [
        { day: "monday", recipeId: recipe.id },
        { day: "wednesday", recipeId: recipe.id },
      ],
    });
    expect(withSlots.slots.find((s) => s.day === "monday")?.status).toBe("pending");
    expect(withSlots.slots.find((s) => s.day === "wednesday")?.recipeId).toBe(recipe.id);
    expect(withSlots.slots.find((s) => s.day === "monday")?.recipeTitle).toBe(
      "Sheet-pan chicken",
    );
    expect(plans.getWeeklyPlan(withSlots.id)).toEqual(withSlots);
  });

  it("rejects non-Monday, unknown Recipe, duplicate day, duplicate week, and library full", () => {
    const recipe = seedRecipe();
    try {
      plans.createWeeklyPlan({ weekStartDate: "2026-07-14" });
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    try {
      plans.createWeeklyPlan({
        weekStartDate: "2026-07-13",
        slots: [{ day: "monday", recipeId: randomUUID() }],
      });
      expect.fail("expected NOT_FOUND");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
    try {
      plans.createWeeklyPlan({
        weekStartDate: "2026-07-13",
        slots: [
          { day: "monday", recipeId: recipe.id },
          { day: "monday", recipeId: recipe.id },
        ],
      });
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    plans.createWeeklyPlan({ weekStartDate: "2026-07-13" });
    try {
      plans.createWeeklyPlan({ weekStartDate: "2026-07-13" });
      expect.fail("expected WEEKLY_PLAN_CONFLICT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.WEEKLY_PLAN_CONFLICT);
    }

    for (let i = 1; i < MAX_WEEKLY_PLANS_PER_HOUSEHOLD; i++) {
      plans.createWeeklyPlan({ weekStartDate: mondayOffset(i) });
    }
    expect(plans.listWeeklyPlans().items).toHaveLength(MAX_WEEKLY_PLANS_PER_HOUSEHOLD);
    try {
      plans.createWeeklyPlan({ weekStartDate: mondayOffset(MAX_WEEKLY_PLANS_PER_HOUSEHOLD) });
      expect.fail("expected WEEKLY_PLAN_LIBRARY_FULL");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.WEEKLY_PLAN_LIBRARY_FULL);
    }
    expect(plans.listWeeklyPlans().items).toHaveLength(MAX_WEEKLY_PLANS_PER_HOUSEHOLD);
  });

  it("lists newest first with filledSlotCount and materializes detail", () => {
    const recipe = seedRecipe();
    plans.createWeeklyPlan({ weekStartDate: "2026-07-13" });
    plans.createWeeklyPlan({
      weekStartDate: "2026-07-20",
      slots: [{ day: "friday", recipeId: recipe.id }],
    });
    const list = plans.listWeeklyPlans();
    expect(list.maxWeeklyPlans).toBe(104);
    expect(list.items.map((i) => i.weekStartDate)).toEqual(["2026-07-20", "2026-07-13"]);
    expect(list.items[0].filledSlotCount).toBe(1);
    expect(list.items[1].filledSlotCount).toBe(0);
    expect(plans.listWeeklyPlans().items).toHaveLength(2);
  });

  it("per-slot assign/clear/status; Recipe in-use; household isolation", () => {
    const recipe = seedRecipe();
    const plan = plans.createWeeklyPlan({ weekStartDate: "2026-07-13" });

    const assigned = plans.assignSlot(plan.id, "monday", recipe.id);
    expect(assigned.slots.find((s) => s.day === "monday")?.status).toBe("pending");
    expect(assigned.slots.find((s) => s.day === "tuesday")?.recipeId).toBeNull();

    const approved = plans.setSlotStatus(plan.id, "monday", "approved");
    expect(approved.slots.find((s) => s.day === "monday")?.status).toBe("approved");
    expect(approved.slots.find((s) => s.day === "monday")?.recipeId).toBe(recipe.id);

    const replaced = plans.assignSlot(plan.id, "monday", recipe.id);
    expect(replaced.slots.find((s) => s.day === "monday")?.status).toBe("pending");

    plans.setSlotStatus(plan.id, "monday", "rejected");
    const cleared = plans.clearSlot(plan.id, "monday");
    expect(cleared.slots.find((s) => s.day === "monday")?.status).toBeNull();

    const idempotent = plans.clearSlot(plan.id, "friday");
    expect(idempotent.slots.find((s) => s.day === "friday")?.recipeId).toBeNull();

    try {
      plans.setSlotStatus(plan.id, "friday", "approved");
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }

    plans.assignSlot(plan.id, "tuesday", recipe.id);
    try {
      recipes.deleteRecipe(recipe.id);
      expect.fail("expected RECIPE_IN_USE");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.RECIPE_IN_USE);
    }

    try {
      otherHousehold.getWeeklyPlan(plan.id);
      expect.fail("expected NOT_FOUND");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
    expect(otherHousehold.listWeeklyPlans().items).toHaveLength(0);
  });

  it("deletes plan permanently and unblocks Recipe delete", () => {
    const recipe = seedRecipe();
    const a = plans.createWeeklyPlan({
      weekStartDate: "2026-07-13",
      slots: [{ day: "monday", recipeId: recipe.id }],
    });
    const b = plans.createWeeklyPlan({ weekStartDate: "2026-07-20" });
    plans.deleteWeeklyPlan(a.id);
    try {
      plans.getWeeklyPlan(a.id);
      expect.fail("expected NOT_FOUND");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
    expect(plans.listWeeklyPlans().items.map((i) => i.id)).toEqual([b.id]);
    recipes.deleteRecipe(recipe.id);
  });
});
