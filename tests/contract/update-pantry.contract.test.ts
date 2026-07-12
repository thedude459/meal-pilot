import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("update-pantry contract", () => {
  function app() {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-up-api-"));
    return createApp(join(dir, "test.sqlite"));
  }

  async function seedChecked(a: ReturnType<typeof createApp>) {
    const oilRes = await a.request("/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Olive oil",
        defaultUnitId: "tbsp",
        shoppingCategoryId: "dry_goods",
      }),
    });
    expect(oilRes.status).toBe(201);
    const oil = (await json(oilRes)) as { id: string };

    const chickenRes = await a.request("/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Chicken thighs",
        defaultUnitId: "lb",
        shoppingCategoryId: "meat_seafood",
      }),
    });
    const chicken = (await json(chickenRes)) as { id: string };

    await a.request("/pantry-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: oil.id,
        quantity: 2,
        unitId: "tbsp",
      }),
    });

    await a.request("/pantry-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: chicken.id,
        quantity: 0.5,
        unitId: "lb",
        expirationDate: "2020-01-01",
      }),
    });

    const gOilRes = await a.request("/grocery-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: oil.id,
        quantity: 3,
        unitId: "tbsp",
      }),
    });
    const gOil = (await json(gOilRes)) as { id: string };

    const gChRes = await a.request("/grocery-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: chicken.id,
        quantity: 1.5,
        unitId: "lb",
      }),
    });
    const gCh = (await json(gChRes)) as { id: string };

    await a.request(`/grocery-items/${gOil.id}/checked`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checked: true }),
    });
    await a.request(`/grocery-items/${gCh.id}/checked`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checked: true }),
    });

    return { oil, chicken };
  }

  it("POST preview and confirm match OpenAPI shapes", async () => {
    const a = app();
    await seedChecked(a);

    const previewRes = await a.request("/pantry-items/update/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ removeExpired: true }),
    });
    expect(previewRes.status).toBe(200);
    const previewBody = await json(previewRes);
    expect(previewBody).toHaveProperty("preview");
    const preview = previewBody.preview as {
      removeExpired: boolean;
      applied: Array<Record<string, unknown>>;
      expiredRemoved: unknown[];
      appliedCount: number;
      expiredRemovedCount: number;
    };
    expect(preview.removeExpired).toBe(true);
    expect(preview.appliedCount).toBe(2);
    expect(preview.expiredRemovedCount).toBe(1);
    expect(preview.applied[0]).toHaveProperty("currentQuantity");
    expect(preview.applied[0]).toHaveProperty("action");
    expect(preview.applied[0]).toHaveProperty("groceryQuantity");
    expect(preview.applied[0]).toHaveProperty("resultingQuantity");

    const confirmRes = await a.request("/pantry-items/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ removeExpired: true }),
    });
    expect(confirmRes.status).toBe(200);
    const confirmBody = await json(confirmRes);
    expect(confirmBody).toHaveProperty("items");
    expect(confirmBody).toHaveProperty("maxPantryItems", 500);
    expect(confirmBody).toHaveProperty("report");
    const report = confirmBody.report as typeof preview;
    expect(report.appliedCount).toBe(2);
    expect(report.expiredRemovedCount).toBe(1);
  });

  it("returns UPDATE_PANTRY_NO_CHECKED when nothing checked", async () => {
    const a = app();
    const res = await a.request("/pantry-items/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ removeExpired: true }),
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe("UPDATE_PANTRY_NO_CHECKED");
  });

  it("rejects invalid removeExpired type", async () => {
    const a = app();
    const res = await a.request("/pantry-items/update/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ removeExpired: "yes" }),
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("empty preview when zero checked", async () => {
    const a = app();
    const res = await a.request("/pantry-items/update/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    const preview = body.preview as { applied: unknown[]; appliedCount: number };
    expect(preview.appliedCount).toBe(0);
    expect(preview.applied).toEqual([]);
  });
});
