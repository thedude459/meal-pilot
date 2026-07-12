import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

const payload = {
  title: "Weeknight Pasta",
  ingredients: [
    { name: "pasta", quantity: 12, unitId: "oz" },
    { name: "olive oil", quantity: 1.5, unitId: "tbsp" },
  ],
  instructionSteps: ["Boil pasta until al dente.", "Toss with olive oil and serve."],
  servings: 4,
  cuisineTags: ["Italian", "italian", "weeknight"],
  dietaryAttributeIds: ["vegetarian", "vegetarian", "nut_free"],
  source: "ai",
};

describe("recipes contract", () => {
  function app() {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-recipe-api-"));
    return createApp(join(dir, "test.sqlite"));
  }

  it("GET /ingredient-units returns catalog", async () => {
    const res = await app().request("/ingredient-units");
    expect(res.status).toBe(200);
    const body = await json(res);
    const items = body.items as { id: string; label: string; kind: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      kind: expect.any(String),
    });
  });

  it("POST/GET/PUT/DELETE recipes per OpenAPI shared schema", async () => {
    const a = app();
    const created = await a.request("/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(created.status).toBe(201);
    const recipe = (await json(created)) as {
      id: string;
      source: string;
      cuisineTags: string[];
      dietaryAttributeIds: string[];
      ingredients: unknown[];
      instructionSteps: unknown[];
    };
    expect(recipe.source).toBe("curated");
    expect(recipe.cuisineTags).toEqual(["Italian", "weeknight"]);
    expect(recipe.dietaryAttributeIds).toEqual(["vegetarian", "nut_free"]);
    expect(recipe).toMatchObject({
      title: "Weeknight Pasta",
      ingredients: expect.any(Array),
      instructionSteps: expect.any(Array),
      cuisineTags: expect.any(Array),
      dietaryAttributeIds: expect.any(Array),
      source: "curated",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const list = await a.request("/recipes");
    expect(list.status).toBe(200);
    const listBody = await json(list);
    expect(listBody.maxRecipes).toBe(500);
    expect((listBody.items as unknown[]).length).toBe(1);

    const get = await a.request(`/recipes/${recipe.id}`);
    expect(get.status).toBe(200);
    expect((await json(get)).source).toBe("curated");

    const put = await a.request(`/recipes/${recipe.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Weeknight Pasta",
        ingredients: [
          { name: "pasta", quantity: 12, unitId: "oz" },
          { name: "garlic", quantity: 2, unitId: "clove" },
        ],
        instructionSteps: ["Boil pasta.", "Add garlic oil."],
        cuisineTags: ["Italian"],
        dietaryAttributeIds: ["vegetarian"],
      }),
    });
    expect(put.status).toBe(200);
    const replaced = await json(put);
    expect((replaced.ingredients as { name: string }[]).map((i) => i.name)).toEqual([
      "pasta",
      "garlic",
    ]);
    expect(replaced.source).toBe("curated");

    const del = await a.request(`/recipes/${recipe.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const missing = await a.request(`/recipes/${recipe.id}`);
    expect(missing.status).toBe(404);
  });

  it("POST returns UNKNOWN_UNIT and UNKNOWN_RESTRICTION", async () => {
    const a = app();
    const unit = await a.request("/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Bad Unit",
        ingredients: [{ name: "flour", quantity: 1, unitId: "not_a_unit" }],
        instructionSteps: ["Mix."],
      }),
    });
    expect(unit.status).toBe(400);
    expect(await json(unit)).toMatchObject({ code: "UNKNOWN_UNIT" });

    const dietary = await a.request("/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Bad Tag",
        ingredients: [{ name: "rice", quantity: 1, unitId: "cup" }],
        instructionSteps: ["Cook."],
        dietaryAttributeIds: ["not_a_real_restriction"],
      }),
    });
    expect(dietary.status).toBe(400);
    expect(await json(dietary)).toMatchObject({ code: "UNKNOWN_RESTRICTION" });
  });

  it("does not register AI generation routes under /recipes", async () => {
    const a = app();
    const res = await a.request("/recipes/generate", { method: "POST" });
    expect([404, 405]).toContain(res.status);
  });
});
