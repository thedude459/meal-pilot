import { Hono } from "hono";
import { z } from "zod";
import { listIngredientUnits } from "../../domain/ingredient-units.js";
import { validationError } from "../../domain/errors.js";
import type { RecipeService } from "../../services/recipe-service.js";

const ingredientLineSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unitId: z.string(),
});

const upsertRecipeSchema = z.object({
  title: z.string(),
  ingredients: z.array(ingredientLineSchema),
  instructionSteps: z.array(z.string()),
  servings: z.number().int().positive().nullable().optional(),
  prepTimeMinutes: z.number().int().nonnegative().nullable().optional(),
  cookTimeMinutes: z.number().int().nonnegative().nullable().optional(),
  cuisineTags: z.array(z.string()).optional(),
  dietaryAttributeIds: z.array(z.string()).optional(),
  source: z.enum(["curated", "ai"]).optional(),
});

export function createRecipeRoutes(service: RecipeService) {
  const routes = new Hono();

  routes.get("/ingredient-units", (c) => {
    return c.json({ items: listIngredientUnits() });
  });

  routes.get("/recipes", (c) => {
    return c.json(service.listRecipes());
  });

  routes.post("/recipes", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = upsertRecipeSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid create recipe payload");
    }
    const recipe = service.createRecipe(parsed.data);
    return c.json(recipe, 201);
  });

  routes.get("/recipes/:recipeId", (c) => {
    return c.json(service.getRecipe(c.req.param("recipeId")));
  });

  routes.put("/recipes/:recipeId", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = upsertRecipeSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid replace recipe payload");
    }
    const recipe = service.replaceRecipe(c.req.param("recipeId"), parsed.data);
    return c.json(recipe);
  });

  routes.delete("/recipes/:recipeId", (c) => {
    service.deleteRecipe(c.req.param("recipeId"));
    return c.body(null, 204);
  });

  return routes;
}
