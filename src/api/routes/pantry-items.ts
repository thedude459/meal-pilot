import { Hono } from "hono";
import { z } from "zod";
import { validationError } from "../../domain/errors.js";
import type { PantryItemService } from "../../services/pantry-item-service.js";

const createPantryItemSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.number(),
  unitId: z.string(),
  expirationDate: z.string().nullable().optional(),
});

const replacePantryItemSchema = z
  .object({
    quantity: z.number(),
    unitId: z.string(),
    expirationDate: z.string().nullable(),
  })
  .strict();

export function createPantryItemRoutes(service: PantryItemService) {
  const routes = new Hono();

  routes.get("/pantry-items", (c) => {
    return c.json(service.listPantryItems());
  });

  routes.post("/pantry-items", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createPantryItemSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid create pantry item payload");
    }
    const item = service.createPantryItem(parsed.data);
    return c.json(item, 201);
  });

  routes.get("/pantry-items/:pantryItemId", (c) => {
    return c.json(service.getPantryItem(c.req.param("pantryItemId")));
  });

  routes.put("/pantry-items/:pantryItemId", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body && typeof body === "object" && "ingredientId" in body) {
      throw validationError("ingredientId cannot be changed on replace");
    }
    const parsed = replacePantryItemSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid replace pantry item payload");
    }
    const item = service.replacePantryItem(c.req.param("pantryItemId"), parsed.data);
    return c.json(item);
  });

  routes.delete("/pantry-items/:pantryItemId", (c) => {
    service.deletePantryItem(c.req.param("pantryItemId"));
    return c.body(null, 204);
  });

  return routes;
}
