import { Hono } from "hono";
import { getDb } from "../db/client.js";
import { FamilyMemberService } from "../services/family-member-service.js";
import { createFamilyMemberRoutes, mapDomainError } from "./routes/family-members.js";

export function createApp(dbPath?: string) {
  const { db } = getDb(dbPath);
  const service = new FamilyMemberService(db);
  const app = new Hono();

  app.onError((err, c) => {
    const mapped = mapDomainError(err);
    if (mapped) {
      return c.json(mapped.body, mapped.status as 400 | 404 | 409);
    }
    console.error(err);
    return c.json({ code: "VALIDATION_ERROR", message: "Internal server error" }, 500);
  });

  app.route("/", createFamilyMemberRoutes(service));
  return app;
}
