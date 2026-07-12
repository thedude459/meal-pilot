import { Hono } from "hono";
import { z } from "zod";
import { validationError } from "../../domain/errors.js";
import { GENERATION_MODES } from "../../domain/meal-suggestion.js";
import type { MealSuggestionService } from "../../services/meal-suggestion-service.js";

const modeSchema = z.enum(GENERATION_MODES);

const generateSchema = z
  .object({
    weekStartDate: z.string(),
    mode: modeSchema.optional(),
  })
  .strict();

export function createGenerateWeeklyMealsRoutes(service: MealSuggestionService) {
  const routes = new Hono();

  routes.post("/weekly-plans/generate", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid generate weekly meals payload");
    }
    const result = service.generateWeeklyMeals(parsed.data);
    return c.json(result);
  });

  return routes;
}
