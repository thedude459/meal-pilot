import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("grocery-items contract", () => {
  function app() {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-grocery-api-"));
    return createApp(join(dir, "test.sqlite"));
  }

  async function seedIngredient(
    a: ReturnType<typeof createApp>,
    name: string,
    opts: { defaultUnitId?: string; shoppingCategoryId?: string | null } = {},
  ) {
    const res = await a.request("/ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: name,
        defaultUnitId: opts.defaultUnitId ?? "tbsp",
        shoppingCategoryId: opts.shoppingCategoryId ?? "dry_goods",
        aliases: [],
      }),
    });
    expect(res.status).toBe(201);
    return (await json(res)) as { id: string };
  }

  it("POST/GET list/detail/PUT/checked/DELETE grocery-items per OpenAPI", async () => {
    const a = app();
    const oil = await seedIngredient(a, "Olive oil", {
      shoppingCategoryId: "dry_goods",
    });
    const milk = await seedIngredient(a, "Milk", {
      defaultUnitId: "cup",
      shoppingCategoryId: "dairy",
    });

    const created = await a.request("/grocery-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: oil.id,
        quantity: 2.5,
        unitId: "tbsp",
      }),
    });
    expect(created.status).toBe(201);
    const item = (await json(created)) as {
      id: string;
      quantity: number;
      checked: boolean;
      shoppingCategoryId: string;
    };
    expect(item.quantity).toBe(2.5);
    expect(item.checked).toBe(false);
    expect(item.shoppingCategoryId).toBe("dry_goods");

    await a.request("/grocery-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: milk.id,
        quantity: 1,
        unitId: "cup",
      }),
    });

    const withChecked = await a.request("/grocery-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: oil.id,
        quantity: 1,
        unitId: "tbsp",
        checked: true,
      }),
    });
    expect(withChecked.status).toBe(400);
    expect((await json(withChecked)).code).toBe("VALIDATION_ERROR");

    const list = await a.request("/grocery-items");
    expect(list.status).toBe(200);
    const listBody = await json(list);
    expect(listBody.maxGroceryItems).toBe(500);
    const groups = listBody.groups as { shoppingCategoryId: string }[];
    expect(groups.map((g) => g.shoppingCategoryId)).toEqual(["dairy", "dry_goods"]);

    const get = await a.request(`/grocery-items/${item.id}`);
    expect(get.status).toBe(200);

    const replaced = await a.request(`/grocery-items/${item.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity: 3, unitId: "tbsp" }),
    });
    expect(replaced.status).toBe(200);
    const replacedBody = await json(replaced);
    expect(replacedBody.quantity).toBe(3);
    expect(replacedBody.checked).toBe(false);

    const putCheckedOnReplace = await a.request(`/grocery-items/${item.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity: 3, unitId: "tbsp", checked: true }),
    });
    expect(putCheckedOnReplace.status).toBe(400);

    const checked = await a.request(`/grocery-items/${item.id}/checked`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checked: true }),
    });
    expect(checked.status).toBe(200);
    const checkedBody = await json(checked);
    expect(checkedBody.checked).toBe(true);
    expect(checkedBody.quantity).toBe(3);

    const badToggle = await a.request(`/grocery-items/${item.id}/checked`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checked: true, quantity: 1 }),
    });
    expect(badToggle.status).toBe(400);

    const mismatch = await a.request("/grocery-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: milk.id,
        quantity: 1,
        unitId: "tbsp",
      }),
    });
    expect(mismatch.status).toBe(400);
    expect((await json(mismatch)).code).toBe("UNIT_MISMATCH");

    const dup = await a.request("/grocery-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredientId: oil.id,
        quantity: 1,
        unitId: "tbsp",
      }),
    });
    expect(dup.status).toBe(409);
    expect((await json(dup)).code).toBe("GROCERY_INGREDIENT_CONFLICT");

    const delIng = await a.request(`/ingredients/${oil.id}`, { method: "DELETE" });
    expect(delIng.status).toBe(409);
    expect((await json(delIng)).code).toBe("INGREDIENT_IN_USE");

    const del = await a.request(`/grocery-items/${item.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const delIng2 = await a.request(`/ingredients/${oil.id}`, { method: "DELETE" });
    expect(delIng2.status).toBe(204);
  });
});
