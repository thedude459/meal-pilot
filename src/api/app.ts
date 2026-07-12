import { Hono } from "hono";
import { createDb, getDb, runMigrations } from "../db/client.js";
import { FamilyMemberService } from "../services/family-member-service.js";
import { IngredientService } from "../services/ingredient-service.js";
import { RecipeService } from "../services/recipe-service.js";
import { createFamilyMemberRoutes, mapDomainError } from "./routes/family-members.js";
import { createIngredientRoutes } from "./routes/ingredients.js";
import { createRecipeRoutes } from "./routes/recipes.js";

export function createApp(dbPath?: string) {
  const db =
    dbPath !== undefined
      ? (() => {
          const handle = createDb(dbPath);
          runMigrations(handle.sqlite);
          return handle.db;
        })()
      : getDb().db;

  const familyService = new FamilyMemberService(db);
  const recipeService = new RecipeService(db);
  const ingredientService = new IngredientService(db);
  const app = new Hono();

  app.onError((err, c) => {
    const mapped = mapDomainError(err);
    if (mapped) {
      return c.json(mapped.body, mapped.status as 400 | 404 | 409);
    }
    console.error(err);
    return c.json({ code: "VALIDATION_ERROR", message: "Internal server error" }, 500);
  });

  app.route("/", createFamilyMemberRoutes(familyService));
  app.route("/", createRecipeRoutes(recipeService));
  app.route("/", createIngredientRoutes(ingredientService));
  return app;
}
