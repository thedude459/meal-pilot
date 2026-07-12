import { Hono } from "hono";
import { createDb, getDb, runMigrations } from "../db/client.js";
import { FamilyMemberService } from "../services/family-member-service.js";
import { GroceryItemService } from "../services/grocery-item-service.js";
import { IngredientService } from "../services/ingredient-service.js";
import { MealSuggestionService } from "../services/meal-suggestion-service.js";
import { PantryItemService } from "../services/pantry-item-service.js";
import { RecipeService } from "../services/recipe-service.js";
import { WeeklyPlanService } from "../services/weekly-plan-service.js";
import { createFamilyMemberRoutes, mapDomainError } from "./routes/family-members.js";
import { createBuildGroceryListRoutes } from "./routes/build-grocery-list.js";
import { createGenerateWeeklyMealsRoutes } from "./routes/generate-weekly-meals.js";
import { createGroceryItemRoutes } from "./routes/grocery-items.js";
import { createIngredientRoutes } from "./routes/ingredients.js";
import { createPantryItemRoutes } from "./routes/pantry-items.js";
import { createUpdatePantryRoutes } from "./routes/update-pantry.js";
import { createRecipeRoutes } from "./routes/recipes.js";
import { createWeeklyPlanRoutes } from "./routes/weekly-plans.js";
import { GroceryListBuilderService } from "../services/grocery-list-builder-service.js";
import { PantryManagerService } from "../services/pantry-manager-service.js";

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
  const pantryItemService = new PantryItemService(db);
  const groceryItemService = new GroceryItemService(db);
  const weeklyPlanService = new WeeklyPlanService(db);
  const mealSuggestionService = new MealSuggestionService(db);
  const groceryListBuilderService = new GroceryListBuilderService(db);
  const pantryManagerService = new PantryManagerService(db);
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
  // Register update before parameterized pantry-item routes for clarity
  app.route("/", createUpdatePantryRoutes(pantryManagerService));
  app.route("/", createPantryItemRoutes(pantryItemService));
  // Register build before parameterized grocery-item routes for clarity
  app.route("/", createBuildGroceryListRoutes(groceryListBuilderService));
  app.route("/", createGroceryItemRoutes(groceryItemService));
  // Register generate before parameterized weekly-plan routes for clarity
  app.route("/", createGenerateWeeklyMealsRoutes(mealSuggestionService));
  app.route("/", createWeeklyPlanRoutes(weeklyPlanService, mealSuggestionService));
  return app;
}
