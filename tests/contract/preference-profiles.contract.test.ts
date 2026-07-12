import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("preference-profiles contract", () => {
  function app() {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-api-"));
    return createApp(join(dir, "test.sqlite"));
  }

  it("GET /dietary-restrictions returns id+label catalog", async () => {
    const res = await app().request("/dietary-restrictions");
    expect(res.status).toBe(200);
    const body = await json(res);
    const items = body.items as { id: string; label: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toMatchObject({ id: expect.any(String), label: expect.any(String) });
  });

  it("PUT/GET preferences and GET effective per OpenAPI", async () => {
    const a = app();
    const created = await a.request("/family-members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Alex" }),
    });
    expect(created.status).toBe(201);
    const member = (await json(created)) as { id: string };

    const put = await a.request(`/family-members/${member.id}/preferences`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        likes: ["pasta", "Pasta", "tacos"],
        dislikes: ["olives", "pasta"],
        dietaryRestrictionIds: ["gluten_free", "gluten_free", "nut_free"],
      }),
    });
    expect(put.status).toBe(200);
    expect(await json(put)).toEqual({
      likes: ["pasta", "tacos"],
      dislikes: ["olives", "pasta"],
      dietaryRestrictionIds: ["gluten_free", "nut_free"],
    });

    const get = await a.request(`/family-members/${member.id}/preferences`);
    expect(get.status).toBe(200);
    expect(await json(get)).toEqual({
      likes: ["pasta", "tacos"],
      dislikes: ["olives", "pasta"],
      dietaryRestrictionIds: ["gluten_free", "nut_free"],
    });

    const effective = await a.request(`/family-members/${member.id}/preferences/effective`);
    expect(effective.status).toBe(200);
    expect(await json(effective)).toEqual({
      effectiveLikes: ["tacos"],
      effectiveDislikes: ["olives", "pasta"],
      hardRestrictions: ["gluten_free", "nut_free"],
    });
  });

  it("PUT returns PREFERENCE_LIMIT for overlong labels", async () => {
    const a = app();
    const created = await a.request("/family-members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Blair" }),
    });
    const member = (await json(created)) as { id: string };

    const put = await a.request(`/family-members/${member.id}/preferences`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        likes: ["x".repeat(41)],
        dislikes: [],
        dietaryRestrictionIds: [],
      }),
    });
    expect(put.status).toBe(400);
    expect(await json(put)).toMatchObject({ code: "PREFERENCE_LIMIT" });
  });

  it("PUT returns UNKNOWN_RESTRICTION for invalid catalog ids", async () => {
    const a = app();
    const created = await a.request("/family-members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Casey" }),
    });
    const member = (await json(created)) as { id: string };

    const put = await a.request(`/family-members/${member.id}/preferences`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        likes: [],
        dislikes: [],
        dietaryRestrictionIds: ["not_real"],
      }),
    });
    expect(put.status).toBe(400);
    expect(await json(put)).toMatchObject({ code: "UNKNOWN_RESTRICTION" });
  });

  it("GET preferences returns 404 after member delete", async () => {
    const a = app();
    const created = await a.request("/family-members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Drew" }),
    });
    const member = (await json(created)) as { id: string };
    const del = await a.request(`/family-members/${member.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    const get = await a.request(`/family-members/${member.id}/preferences`);
    expect(get.status).toBe(404);
    expect(await json(get)).toMatchObject({ code: "NOT_FOUND" });
  });
});
