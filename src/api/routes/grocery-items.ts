import { Hono } from "hono";
import { z } from "zod";
import { validationError } from "../../domain/errors.js";
import type { GroceryItemService } from "../../services/grocery-item-service.js";

const createGroceryItemSchema = z
  .object({
    ingredientId: z.string().uuid(),
    quantity: z.number(),
    unitId: z.string(),
  })
  .strict();

const replaceGroceryItemSchema = z
  .object({
    quantity: z.number(),
    unitId: z.string(),
  })
  .strict();

const setCheckedSchema = z
  .object({
    checked: z.boolean(),
  })
  .strict();

export function createGroceryItemRoutes(service: GroceryItemService) {
  const routes = new Hono();

  routes.get("/grocery-items", (c) => {
    return c.json(service.listGroceryItems());
  });

  routes.post("/grocery-items", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body && typeof body === "object" && "checked" in body) {
      throw validationError("checked cannot be set on create");
    }
    const parsed = createGroceryItemSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid create grocery item payload");
    }
    const item = service.createGroceryItem(parsed.data);
    return c.json(item, 201);
  });

  routes.get("/grocery-items/:groceryItemId", (c) => {
    return c.json(service.getGroceryItem(c.req.param("groceryItemId")));
  });

  routes.put("/grocery-items/:groceryItemId", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body && typeof body === "object") {
      if ("ingredientId" in body) {
        throw validationError("ingredientId cannot be changed on replace");
      }
      if ("checked" in body) {
        throw validationError("checked cannot be changed on quantity/unit replace");
      }
    }
    const parsed = replaceGroceryItemSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid replace grocery item payload");
    }
    const item = service.replaceGroceryItem(c.req.param("groceryItemId"), parsed.data);
    return c.json(item);
  });

  routes.put("/grocery-items/:groceryItemId/checked", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = setCheckedSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid set checked payload");
    }
    const item = service.setGroceryItemChecked(c.req.param("groceryItemId"), parsed.data);
    return c.json(item);
  });

  routes.delete("/grocery-items/:groceryItemId", (c) => {
    service.deleteGroceryItem(c.req.param("groceryItemId"));
    return c.body(null, 204);
  });

  return routes;
}
