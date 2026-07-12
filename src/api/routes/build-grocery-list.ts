import { Hono } from "hono";
import { z } from "zod";
import { validationError } from "../../domain/errors.js";
import type { GroceryListBuilderService } from "../../services/grocery-list-builder-service.js";

const buildGroceryListRequestSchema = z
  .object({
    weekStartDate: z.string(),
  })
  .strict();

export function createBuildGroceryListRoutes(service: GroceryListBuilderService) {
  const routes = new Hono();

  routes.post("/grocery-items/build", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = buildGroceryListRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("weekStartDate is required");
    }
    const result = service.buildGroceryList(parsed.data);
    return c.json(result, 200);
  });

  return routes;
}
