import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("weekly-plans contract", () => {
  function app() {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-weekly-api-"));
    return createApp(join(dir, "test.sqlite"));
  }

  async function seedRecipe(a: ReturnType<typeof createApp>, title = "Sheet-pan chicken") {
    const res = await a.request("/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        ingredients: [{ name: "Chicken thighs", quantity: 1.5, unitId: "lb" }],
        instructionSteps: ["Roast at 425F until done."],
      }),
    });
    expect(res.status).toBe(201);
    return (await json(res)) as { id: string; title: string };
  }

  it("POST/GET list/detail/slot ops/DELETE weekly-plans per OpenAPI", async () => {
    const a = app();
    const recipe = await seedRecipe(a);

    const empty = await a.request("/weekly-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-13" }),
    });
    expect(empty.status).toBe(201);
    const emptyPlan = (await json(empty)) as {
      id: string;
      slots: Array<{ day: string; recipeId: string | null; status: string | null }>;
    };
    expect(emptyPlan.slots).toHaveLength(7);

    const created = await a.request("/weekly-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        weekStartDate: "2026-07-20",
        slots: [
          { day: "monday", recipeId: recipe.id },
          { day: "wednesday", recipeId: recipe.id },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const plan = (await json(created)) as {
      id: string;
      weekStartDate: string;
      slots: Array<{ day: string; recipeId: string | null; status: string | null; recipeTitle: string | null }>;
    };
    expect(plan.weekStartDate).toBe("2026-07-20");
    expect(plan.slots.find((s) => s.day === "monday")?.status).toBe("pending");

    const list = await a.request("/weekly-plans");
    expect(list.status).toBe(200);
    const listed = (await json(list)) as {
      items: Array<{ weekStartDate: string; filledSlotCount: number }>;
      maxWeeklyPlans: number;
    };
    expect(listed.maxWeeklyPlans).toBe(104);
    expect(listed.items[0].weekStartDate).toBe("2026-07-20");
    expect(listed.items[0].filledSlotCount).toBe(2);

    const detail = await a.request(`/weekly-plans/${plan.id}`);
    expect(detail.status).toBe(200);

    const assign = await a.request(`/weekly-plans/${plan.id}/slots/tuesday`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipeId: recipe.id }),
    });
    expect(assign.status).toBe(200);

    const approve = await a.request(`/weekly-plans/${plan.id}/slots/monday/status`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(approve.status).toBe(200);
    const approved = (await json(approve)) as {
      slots: Array<{ day: string; status: string | null }>;
    };
    expect(approved.slots.find((s) => s.day === "monday")?.status).toBe("approved");

    const clear = await a.request(`/weekly-plans/${plan.id}/slots/tuesday`, {
      method: "DELETE",
    });
    expect(clear.status).toBe(200);

    const clearEmpty = await a.request(`/weekly-plans/${plan.id}/slots/friday`, {
      method: "DELETE",
    });
    expect(clearEmpty.status).toBe(200);

    const nonMonday = await a.request("/weekly-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-14" }),
    });
    expect(nonMonday.status).toBe(400);

    const dup = await a.request("/weekly-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-20" }),
    });
    expect(dup.status).toBe(409);
    expect((await json(dup)).code).toBe("WEEKLY_PLAN_CONFLICT");

    const statusEmpty = await a.request(`/weekly-plans/${plan.id}/slots/friday/status`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(statusEmpty.status).toBe(400);

    const recipeDelete = await a.request(`/recipes/${recipe.id}`, { method: "DELETE" });
    expect(recipeDelete.status).toBe(409);
    expect((await json(recipeDelete)).code).toBe("RECIPE_IN_USE");

    const del = await a.request(`/weekly-plans/${plan.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const delEmpty = await a.request(`/weekly-plans/${emptyPlan.id}`, { method: "DELETE" });
    expect(delEmpty.status).toBe(204);

    const recipeGone = await a.request(`/recipes/${recipe.id}`, { method: "DELETE" });
    expect(recipeGone.status).toBe(204);
  });
});
