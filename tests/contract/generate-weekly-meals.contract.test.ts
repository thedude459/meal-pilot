import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("generate-weekly-meals contract", () => {
  function app() {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-gen-api-"));
    return createApp(join(dir, "test.sqlite"));
  }

  async function seedHousehold(a: ReturnType<typeof createApp>) {
    const memberRes = await a.request("/family-members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Alex" }),
    });
    expect(memberRes.status).toBe(201);
    const member = (await json(memberRes)) as { id: string };

    const prefs = await a.request(`/family-members/${member.id}/preferences`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        likes: ["chicken"],
        dislikes: ["anchovy"],
        dietaryRestrictionIds: ["gluten_free"],
      }),
    });
    expect(prefs.status).toBe(200);

    const recipeRes = await a.request("/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Sheet-pan chicken",
        ingredients: [{ name: "Chicken thighs", quantity: 1.5, unitId: "lb" }],
        instructionSteps: ["Roast."],
        dietaryAttributeIds: ["gluten_free"],
        prepTimeMinutes: 15,
        cookTimeMinutes: 30,
      }),
    });
    expect(recipeRes.status).toBe(201);

    const recipe2 = await a.request("/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Grilled salmon",
        ingredients: [{ name: "Salmon", quantity: 1, unitId: "lb" }],
        instructionSteps: ["Grill."],
        dietaryAttributeIds: ["gluten_free"],
      }),
    });
    expect(recipe2.status).toBe(201);

    return member;
  }

  it("POST /weekly-plans/generate returns plan + report", async () => {
    const a = app();
    await seedHousehold(a);

    const res = await a.request("/weekly-plans/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-13" }),
    });
    expect(res.status).toBe(200);
    const body = (await json(res)) as {
      plan: { weekStartDate: string; slots: unknown[] };
      report: { mode: string; filledDays: string[]; unfilledDays: unknown[] };
    };
    expect(body.plan.weekStartDate).toBe("2026-07-13");
    expect(body.plan.slots).toHaveLength(7);
    expect(body.report.mode).toBe("fill-empty");
    expect(Array.isArray(body.report.filledDays)).toBe(true);
  });

  it("rejects non-Monday and unknown mode; regenerate mode accepted", async () => {
    const a = app();
    await seedHousehold(a);

    const bad = await a.request("/weekly-plans/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-14" }),
    });
    expect(bad.status).toBe(400);

    const badMode = await a.request("/weekly-plans/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-13", mode: "all-days" }),
    });
    expect(badMode.status).toBe(400);

    const regen = await a.request("/weekly-plans/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        weekStartDate: "2026-07-13",
        mode: "regenerate-non-approved",
      }),
    });
    expect(regen.status).toBe(200);
    const body = (await json(regen)) as { report: { mode: string } };
    expect(body.report.mode).toBe("regenerate-non-approved");
  });

  it("reject status returns alternativeOutcome", async () => {
    const a = app();
    await seedHousehold(a);
    const gen = await a.request("/weekly-plans/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-13" }),
    });
    const generated = (await json(gen)) as { plan: { id: string } };

    const reject = await a.request(
      `/weekly-plans/${generated.plan.id}/slots/tuesday/status`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      },
    );
    expect(reject.status).toBe(200);
    const body = (await json(reject)) as {
      alternativeOutcome: { applied: boolean; reason?: string };
      slots: Array<{ day: string; status: string | null }>;
    };
    expect(body.alternativeOutcome).toBeDefined();
    expect(typeof body.alternativeOutcome.applied).toBe("boolean");

    const approve = await a.request(
      `/weekly-plans/${generated.plan.id}/slots/monday/status`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      },
    );
    expect(approve.status).toBe(200);
    const approved = (await json(approve)) as { alternativeOutcome?: unknown };
    expect(approved.alternativeOutcome).toBeUndefined();
  });

  it("GENERATION_NO_PREFERENCES when no family members", async () => {
    const a = app();
    const res = await a.request("/weekly-plans/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStartDate: "2026-07-13" }),
    });
    expect(res.status).toBe(400);
    const body = (await json(res)) as { code: string };
    expect(body.code).toBe("GENERATION_NO_PREFERENCES");
  });
});
