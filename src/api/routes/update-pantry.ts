import { Hono } from "hono";
import { z } from "zod";
import { validationError } from "../../domain/errors.js";
import type { PantryManagerService } from "../../services/pantry-manager-service.js";

const updatePantryRequestSchema = z
  .object({
    removeExpired: z.boolean().optional(),
  })
  .strict();

export function createUpdatePantryRoutes(service: PantryManagerService) {
  const routes = new Hono();

  routes.post("/pantry-items/update/preview", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = updatePantryRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw validationError("Invalid UpdatePantry preview payload");
    }
    const result = service.previewUpdatePantry(parsed.data);
    return c.json(result, 200);
  });

  routes.post("/pantry-items/update", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = updatePantryRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw validationError("Invalid UpdatePantry confirm payload");
    }
    const result = service.confirmUpdatePantry(parsed.data);
    return c.json(result, 200);
  });

  return routes;
}
