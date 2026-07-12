import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("build-grocery-list contract", () => {
  function app() {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-bgl-api-"));
    return createApp(join(dir, "test.sqlite"));
  }

  async function seedApprovedWeek(a: ReturnType<typeof createApp>) {
    await a.request("/family-members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Alex" }),
    });

    const chickenRes = await a.request("/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Chicken thighs",
        defaultUnitId: "lb",
        shoppingCategoryId: "meat_seafood",
      }),
    });
    expect(chickenRes.status).toBe(201);

    const oilRes = await a.request("/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Olive oil",
        defaultUnitId: "tbsp",
        shoppingCategoryId: "dry_goods",
        aliases: ["EVOO"],
      }),
    });
    const oil = (await json(oilRes)) as { id: string };

    await a.request("/pantry-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: oil.id,
        quantity: 1,
        unitId: "tbsp",
      }),
    });

    const recipeRes = await a.request("/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Sheet-pan chicken",
        ingredients: [
          { name: "Chicken thighs", quantity: 1.5, unitId: "lb" },
          { name: "Olive oil", quantity: 2, unitId: "tbsp" },
          { name: "Mystery spice", quantity: 1, unitId: "tsp" },
        ],
        instructionSteps: ["Roast."],
        dietaryAttributeIds: [],
      }),
    });
    const recipe = (await json(recipeRes)) as { id: string };

    const gen = await a.request("/weekly-plans/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-13" }),
    });
    const genBody = (await json(gen)) as {
      plan: { id: string; slots: { day: string; recipeId: string | null }[] };
    };
    expect(gen.status).toBe(200);

    // Assign known recipe to monday and approve
    await a.request(`/weekly-plans/${genBody.plan.id}/slots/monday`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipeId: recipe.id }),
    });
    const approve = await a.request(
      `/weekly-plans/${genBody.plan.id}/slots/monday/status`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
    );
    expect(approve.status).toBe(200);
    return { planId: genBody.plan.id, oilId: oil.id };
  }

  it("POST /grocery-items/build returns 200 with groups and report", async () => {
    const a = app();
    await seedApprovedWeek(a);

    const res = await a.request("/grocery-items/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-13" }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toHaveProperty("groups");
    expect(body).toHaveProperty("maxGroceryItems", 500);
    expect(body).toHaveProperty("report");
    const report = body.report as Record<string, unknown>;
    expect(report.weekStartDate).toBe("2026-07-13");
    expect(report.approvedSlotCount).toBe(1);
    expect(Array.isArray(report.created)).toBe(true);
    expect(Array.isArray(report.unmatched)).toBe(true);
    expect(Array.isArray(report.unitConflicts)).toBe(true);
    expect(Array.isArray(report.checkedSkips)).toBe(true);
    expect(
      (report.unmatched as { ingredientName: string }[]).some(
        (u) => u.ingredientName === "Mystery spice",
      ),
    ).toBe(true);
  });

  it("returns checkedSkips with remainingShortfall on rebuild", async () => {
    const a = app();
    await seedApprovedWeek(a);
    await a.request("/grocery-items/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-13" }),
    });

    const list = await json(await a.request("/grocery-items"));
    const item = (list.groups as { items: { id: string; ingredientDisplayName: string }[] }[])
      .flatMap((g) => g.items)
      .find((i) => i.ingredientDisplayName === "Chicken thighs")!;
    await a.request(`/grocery-items/${item.id}/checked`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checked: true }),
    });

    const rebuild = await a.request("/grocery-items/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-13" }),
    });
    expect(rebuild.status).toBe(200);
    const report = (await json(rebuild)).report as {
      checkedSkips: { remainingShortfall: number }[];
    };
    expect(report.checkedSkips.length).toBeGreaterThan(0);
    expect(report.checkedSkips[0]?.remainingShortfall).toBeGreaterThanOrEqual(0);
  });

  it("returns 400/404 error codes for invalid builds", async () => {
    const a = app();
    const nonMonday = await a.request("/grocery-items/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-14" }),
    });
    expect(nonMonday.status).toBe(400);
    expect((await json(nonMonday)).code).toBe("VALIDATION_ERROR");

    const missing = await a.request("/grocery-items/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-13" }),
    });
    expect(missing.status).toBe(404);
    expect((await json(missing)).code).toBe("NOT_FOUND");

    await seedApprovedWeek(a);
    // Create empty plan week with no approvals
    const emptyWeek = await a.request("/weekly-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-06" }),
    });
    expect(emptyWeek.status).toBe(201);
    const zero = await a.request("/grocery-items/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-06" }),
    });
    expect(zero.status).toBe(400);
    expect((await json(zero)).code).toBe("BUILD_NO_APPROVED_MEALS");
  });
});
