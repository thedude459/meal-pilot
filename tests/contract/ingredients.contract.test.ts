import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

const payload = {
  displayName: "  Olive   oil  ",
  defaultUnitId: "tbsp",
  shoppingCategoryId: "dry_goods",
  aliases: ["EVOO", "evoo", "extra virgin olive oil"],
};

describe("ingredients contract", () => {
  function app() {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-ingredient-api-"));
    return createApp(join(dir, "test.sqlite"));
  }

  it("GET /shopping-categories returns catalog", async () => {
    const res = await app().request("/shopping-categories");
    expect(res.status).toBe(200);
    const body = await json(res);
    const items = body.items as { id: string; label: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
    });
  });

  it("POST/GET/PUT/DELETE ingredients per OpenAPI", async () => {
    const a = app();
    const created = await a.request("/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(created.status).toBe(201);
    const ingredient = (await json(created)) as {
      id: string;
      displayName: string;
      aliases: string[];
      shoppingCategoryId: string | null;
    };
    expect(ingredient.displayName).toBe("Olive oil");
    expect(ingredient.aliases).toEqual(["EVOO", "extra virgin olive oil"]);
    expect(ingredient).toMatchObject({
      defaultUnitId: "tbsp",
      shoppingCategoryId: "dry_goods",
      householdId: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const list = await a.request("/ingredients");
    expect(list.status).toBe(200);
    const listBody = await json(list);
    expect(listBody.maxIngredients).toBe(500);
    expect((listBody.items as unknown[]).length).toBe(1);

    const get = await a.request(`/ingredients/${ingredient.id}`);
    expect(get.status).toBe(200);

    const replaced = await a.request(`/ingredients/${ingredient.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Olive oil",
        defaultUnitId: "tbsp",
        shoppingCategoryId: null,
        aliases: ["EVOO"],
      }),
    });
    expect(replaced.status).toBe(200);
    const after = await json(replaced);
    expect(after.shoppingCategoryId).toBeNull();
    expect(after.aliases).toEqual(["EVOO"]);

    const omit = await a.request(`/ingredients/${ingredient.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Olive oil",
        defaultUnitId: "tbsp",
      }),
    });
    expect(omit.status).toBe(400);
    expect((await json(omit)).code).toBe("VALIDATION_ERROR");

    const del = await a.request(`/ingredients/${ingredient.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const gone = await a.request(`/ingredients/${ingredient.id}`);
    expect(gone.status).toBe(404);
  });

  it("POST unknown unit and label conflict map to error codes", async () => {
    const a = app();
    const badUnit = await a.request("/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Flour", defaultUnitId: "not_a_unit" }),
    });
    expect(badUnit.status).toBe(400);
    expect((await json(badUnit)).code).toBe("UNKNOWN_UNIT");

    await a.request("/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Butter", defaultUnitId: "tbsp" }),
    });
    const conflict = await a.request("/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Ghee",
        defaultUnitId: "tbsp",
        aliases: ["ghee"],
      }),
    });
    expect(conflict.status).toBe(409);
    expect((await json(conflict)).code).toBe("INGREDIENT_LABEL_CONFLICT");
  });
});
