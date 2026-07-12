import { Hono } from "hono";
import { z } from "zod";
import { listDietaryRestrictions } from "../../domain/dietary-restrictions.js";
import { DomainError, validationError } from "../../domain/errors.js";
import type { FamilyMemberService } from "../../services/family-member-service.js";

const createMemberSchema = z.object({
  displayName: z.string(),
});

const updateMemberSchema = z.object({
  displayName: z.string(),
});

const replacePreferencesSchema = z.object({
  likes: z.array(z.string()),
  dislikes: z.array(z.string()),
  dietaryRestrictionIds: z.array(z.string()),
});

export function createFamilyMemberRoutes(service: FamilyMemberService) {
  const routes = new Hono();

  routes.get("/dietary-restrictions", (c) => {
    return c.json({ items: listDietaryRestrictions() });
  });

  routes.get("/family-members", (c) => {
    return c.json(service.listFamilyMembers());
  });

  routes.post("/family-members", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid create payload");
    }
    const member = service.createFamilyMember(parsed.data.displayName);
    return c.json(member, 201);
  });

  routes.get("/family-members/:memberId", (c) => {
    const member = service.getFamilyMember(c.req.param("memberId"));
    return c.json(member);
  });

  routes.patch("/family-members/:memberId", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = updateMemberSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid update payload");
    }
    const member = service.updateFamilyMember(c.req.param("memberId"), parsed.data.displayName);
    return c.json(member);
  });

  routes.delete("/family-members/:memberId", (c) => {
    service.deleteFamilyMember(c.req.param("memberId"));
    return c.body(null, 204);
  });

  routes.get("/family-members/:memberId/preferences/effective", (c) => {
    return c.json(service.getEffectivePreferences(c.req.param("memberId")));
  });

  routes.get("/family-members/:memberId/preferences", (c) => {
    return c.json(service.getPreferences(c.req.param("memberId")));
  });

  routes.put("/family-members/:memberId/preferences", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = replacePreferencesSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError("Invalid preferences payload");
    }
    const preferences = service.replacePreferences(c.req.param("memberId"), parsed.data);
    return c.json(preferences);
  });

  return routes;
}

export function mapDomainError(err: unknown): { status: number; body: { code: string; message: string } } | null {
  if (err instanceof DomainError) {
    return { status: err.status, body: { code: err.code, message: err.message } };
  }
  return null;
}
