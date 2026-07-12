import { Hono } from "hono";
import { z } from "zod";
import { validationError } from "../../domain/errors.js";
import { WEEKDAYS, SLOT_STATUSES } from "../../domain/weekly-plan.js";
import type { MealSuggestionService } from "../../services/meal-suggestion-service.js";
import type { WeeklyPlanService } from "../../services/weekly-plan-service.js";

const weekdaySchema = z.enum(WEEKDAYS);
const statusSchema = z.enum(SLOT_STATUSES);

const createSlotSchema = z
  .object({
    day: weekdaySchema,
    recipeId: z.string().uuid(),
  })
  .strict();

const createWeeklyPlanSchema = z
  .object({
    weekStartDate: z.string(),
    slots: z.array(createSlotSchema).max(7).optional(),
  })
  .strict();

const assignSlotSchema = z
  .object({
    recipeId: z.string().uuid(),
  })
  .strict();

const setStatusSchema = z
  .object({
    status: statusSchema,
  })
  .strict();

function parseDayParam(day: string) {
  const parsed = weekdaySchema.safeParse(day);
  if (!parsed.success) {
    throw validationError(`Invalid day: ${day}`);
  }
  return parsed.data;
}

export function createWeeklyPlanRoutes(
  service: WeeklyPlanService,
  suggestions?: MealSuggestionService,
) {
  const routes = new Hono();

  routes.get("/weekly-plans", (c) => {
    return c.json(service.listWeeklyPlans());
  });

  routes.post("/weekly-plans", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createWeeklyPlanSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid create weekly plan payload");
    }
    const plan = service.createWeeklyPlan(parsed.data);
    return c.json(plan, 201);
  });

  routes.get("/weekly-plans/:weeklyPlanId", (c) => {
    return c.json(service.getWeeklyPlan(c.req.param("weeklyPlanId")));
  });

  routes.delete("/weekly-plans/:weeklyPlanId", (c) => {
    service.deleteWeeklyPlan(c.req.param("weeklyPlanId"));
    return c.body(null, 204);
  });

  routes.put("/weekly-plans/:weeklyPlanId/slots/:day", async (c) => {
    const day = parseDayParam(c.req.param("day"));
    const body = await c.req.json().catch(() => null);
    if (body && typeof body === "object" && "status" in body) {
      throw validationError("status cannot be set on assign; use the status endpoint");
    }
    const parsed = assignSlotSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid assign slot payload");
    }
    const plan = service.assignSlot(c.req.param("weeklyPlanId"), day, parsed.data.recipeId);
    return c.json(plan);
  });

  routes.delete("/weekly-plans/:weeklyPlanId/slots/:day", (c) => {
    const day = parseDayParam(c.req.param("day"));
    const plan = service.clearSlot(c.req.param("weeklyPlanId"), day);
    return c.json(plan);
  });

  routes.put("/weekly-plans/:weeklyPlanId/slots/:day/status", async (c) => {
    const day = parseDayParam(c.req.param("day"));
    const body = await c.req.json().catch(() => null);
    if (body && typeof body === "object" && "recipeId" in body) {
      throw validationError("recipeId cannot be set on status update");
    }
    const parsed = setStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid set slot status payload");
    }

    if (parsed.data.status === "rejected" && suggestions) {
      // Transport-only: alternative ranking lives in MealSuggestionEngine
      // (`MealSuggestionService.rejectWithAlternative`). No duplicated domain logic.
      const result = suggestions.rejectWithAlternative(c.req.param("weeklyPlanId"), day);
      return c.json(result);
    }

    const plan = service.setSlotStatus(
      c.req.param("weeklyPlanId"),
      day,
      parsed.data.status,
    );
    return c.json(plan);
  });

  return routes;
}
