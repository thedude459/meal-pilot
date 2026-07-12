import { Hono } from "hono";
import { z } from "zod";
import { validationError } from "../../domain/errors.js";
import { listShoppingCategories } from "../../domain/shopping-categories.js";
import type { IngredientService } from "../../services/ingredient-service.js";

const createIngredientSchema = z.object({
  displayName: z.string(),
  defaultUnitId: z.string(),
  shoppingCategoryId: z.string().nullable().optional(),
  aliases: z.array(z.string()).optional(),
});

const replaceIngredientSchema = z.object({
  displayName: z.string(),
  defaultUnitId: z.string(),
  shoppingCategoryId: z.string().nullable(),
  aliases: z.array(z.string()),
});

export function createIngredientRoutes(service: IngredientService) {
  const routes = new Hono();

  routes.get("/shopping-categories", (c) => {
    return c.json({ items: listShoppingCategories() });
  });

  routes.get("/ingredients", (c) => {
    return c.json(service.listIngredients());
  });

  routes.post("/ingredients", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createIngredientSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid create ingredient payload");
    }
    const ingredient = service.createIngredient(parsed.data);
    return c.json(ingredient, 201);
  });

  routes.get("/ingredients/:ingredientId", (c) => {
    return c.json(service.getIngredient(c.req.param("ingredientId")));
  });

  routes.put("/ingredients/:ingredientId", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = replaceIngredientSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid replace ingredient payload");
    }
    const ingredient = service.replaceIngredient(c.req.param("ingredientId"), parsed.data);
    return c.json(ingredient);
  });

  routes.delete("/ingredients/:ingredientId", (c) => {
    service.deleteIngredient(c.req.param("ingredientId"));
    return c.body(null, 204);
  });

  return routes;
}
