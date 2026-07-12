import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("pantry-items contract", () => {
  function app() {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-pantry-api-"));
    return createApp(join(dir, "test.sqlite"));
  }

  async function seedIngredient(a: ReturnType<typeof createApp>, name = "Olive oil") {
    const res = await a.request("/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: name,
        defaultUnitId: "tbsp",
        shoppingCategoryId: "dry_goods",
        aliases: [],
      }),
    });
    expect(res.status).toBe(201);
    return (await json(res)) as { id: string };
  }

  it("POST/GET list/detail/PUT/DELETE pantry-items per OpenAPI", async () => {
    const a = app();
    const ingredient = await seedIngredient(a);

    const created = await a.request("/pantry-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: ingredient.id,
        quantity: 12.5,
        unitId: "tbsp",
        expirationDate: "2026-12-01",
      }),
    });
    expect(created.status).toBe(201);
    const item = (await json(created)) as {
      id: string;
      quantity: number;
      expirationDate: string | null;
      ingredientDisplayName: string;
    };
    expect(item.quantity).toBe(12.5);
    expect(item.expirationDate).toBe("2026-12-01");
    expect(item.ingredientDisplayName).toBe("Olive oil");
    expect(item).toMatchObject({
      ingredientId: ingredient.id,
      unitId: "tbsp",
      householdId: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const list = await a.request("/pantry-items");
    expect(list.status).toBe(200);
    const listBody = await json(list);
    expect(listBody.maxPantryItems).toBe(500);
    expect((listBody.items as unknown[]).length).toBe(1);

    const get = await a.request(`/pantry-items/${item.id}`);
    expect(get.status).toBe(200);

    const replaced = await a.request(`/pantry-items/${item.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quantity: 10,
        unitId: "tbsp",
        expirationDate: null,
      }),
    });
    expect(replaced.status).toBe(200);
    expect((await json(replaced)).expirationDate).toBeNull();

    const omit = await a.request(`/pantry-items/${item.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity: 10, unitId: "tbsp" }),
    });
    expect(omit.status).toBe(400);
    expect((await json(omit)).code).toBe("VALIDATION_ERROR");

    const withIngredientId = await a.request(`/pantry-items/${item.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quantity: 10,
        unitId: "tbsp",
        expirationDate: null,
        ingredientId: ingredient.id,
      }),
    });
    expect(withIngredientId.status).toBe(400);
    expect((await json(withIngredientId)).code).toBe("VALIDATION_ERROR");

    const del = await a.request(`/pantry-items/${item.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const gone = await a.request(`/pantry-items/${item.id}`);
    expect(gone.status).toBe(404);
  });

  it("POST rejects unit mismatch and duplicate Ingredient", async () => {
    const a = app();
    const ingredient = await seedIngredient(a, "Flour");

    const mismatch = await a.request("/pantry-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: ingredient.id,
        quantity: 1,
        unitId: "cup",
      }),
    });
    expect(mismatch.status).toBe(400);
    expect((await json(mismatch)).code).toBe("UNIT_MISMATCH");

    const ok = await a.request("/pantry-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: ingredient.id,
        quantity: 1,
        unitId: "tbsp",
      }),
    });
    expect(ok.status).toBe(201);

    const dup = await a.request("/pantry-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: ingredient.id,
        quantity: 2,
        unitId: "tbsp",
      }),
    });
    expect(dup.status).toBe(409);
    expect((await json(dup)).code).toBe("PANTRY_INGREDIENT_CONFLICT");
  });

  it("DELETE ingredient while stocked returns INGREDIENT_IN_USE", async () => {
    const a = app();
    const ingredient = await seedIngredient(a, "Sugar");
    const stock = await a.request("/pantry-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: ingredient.id,
        quantity: 1,
        unitId: "tbsp",
      }),
    });
    expect(stock.status).toBe(201);
    const pantryId = ((await json(stock)) as { id: string }).id;

    const blocked = await a.request(`/ingredients/${ingredient.id}`, { method: "DELETE" });
    expect(blocked.status).toBe(409);
    expect((await json(blocked)).code).toBe("INGREDIENT_IN_USE");

    await a.request(`/pantry-items/${pantryId}`, { method: "DELETE" });
    const deleted = await a.request(`/ingredients/${ingredient.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
  });
});
