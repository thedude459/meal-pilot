import { DEFAULT_HOUSEHOLD_ID, type AppDatabase } from "../db/client.js";
import {
  buildNoApprovedMealsError,
  groceryListFullError,
  notFoundError,
  validationError,
} from "../domain/errors.js";
import {
  buildGrocerySyncPlan,
  type BuildReport,
  type CatalogIngredient,
  type ExistingGroceryLine,
  type PantryStock,
} from "../domain/grocery-list-builder.js";
import {
  MAX_GROCERY_ITEMS_PER_HOUSEHOLD,
  type GroceryCategoryGroup,
} from "../domain/grocery-item.js";
import { assertMondayWeekStart } from "../domain/weekly-plan.js";
import { GroceryItemService } from "./grocery-item-service.js";
import { IngredientService } from "./ingredient-service.js";
import { PantryItemService } from "./pantry-item-service.js";
import { RecipeService } from "./recipe-service.js";
import { WeeklyPlanService } from "./weekly-plan-service.js";

export type BuildGroceryListInput = {
  weekStartDate: unknown;
};

export type BuildGroceryListResult = {
  groups: GroceryCategoryGroup[];
  maxGroceryItems: number;
  report: BuildReport;
};

export class GroceryListBuilderService {
  private readonly weeklyPlans: WeeklyPlanService;
  private readonly recipes: RecipeService;
  private readonly ingredients: IngredientService;
  private readonly pantry: PantryItemService;
  private readonly grocery: GroceryItemService;

  constructor(
    db: AppDatabase,
    householdId = DEFAULT_HOUSEHOLD_ID,
    deps?: {
      weeklyPlans?: WeeklyPlanService;
      recipes?: RecipeService;
      ingredients?: IngredientService;
      pantry?: PantryItemService;
      grocery?: GroceryItemService;
    },
  ) {
    this.weeklyPlans = deps?.weeklyPlans ?? new WeeklyPlanService(db, householdId);
    this.recipes = deps?.recipes ?? new RecipeService(db, householdId);
    this.ingredients = deps?.ingredients ?? new IngredientService(db, householdId);
    this.pantry = deps?.pantry ?? new PantryItemService(db, householdId);
    this.grocery = deps?.grocery ?? new GroceryItemService(db, householdId);
  }

  buildGroceryList(input: BuildGroceryListInput): BuildGroceryListResult {
    if (typeof input.weekStartDate !== "string") {
      throw validationError("weekStartDate must be an ISO date YYYY-MM-DD");
    }
    const weekStartDate = assertMondayWeekStart(input.weekStartDate);

    const plan = this.weeklyPlans.findByWeekStart(weekStartDate);
    if (!plan) {
      throw notFoundError("Weekly plan not found for week-start");
    }

    const approvedSlots = plan.slots.filter(
      (s) => s.status === "approved" && s.recipeId !== null,
    );
    if (approvedSlots.length === 0) {
      throw buildNoApprovedMealsError();
    }

    const slotSources = approvedSlots.map((slot) => {
      const recipe = this.recipes.getRecipe(slot.recipeId!);
      return {
        day: slot.day,
        recipeId: recipe.id,
        ingredients: recipe.ingredients.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          unitId: line.unitId,
        })),
      };
    });

    const catalog: CatalogIngredient[] = this.ingredients.listIngredients().items.map((i) => ({
      id: i.id,
      displayName: i.displayName,
      defaultUnitId: i.defaultUnitId,
      aliases: i.aliases,
    }));

    const pantryByIngredientId = new Map<string, PantryStock>();
    for (const item of this.pantry.listPantryItems().items) {
      pantryByIngredientId.set(item.ingredientId, {
        ingredientId: item.ingredientId,
        quantity: item.quantity,
        expirationDate: item.expirationDate,
      });
    }

    const existingList = this.grocery.listGroceryItems();
    const existingGrocery: ExistingGroceryLine[] = existingList.groups.flatMap((g) =>
      g.items.map((item) => ({
        id: item.id,
        ingredientId: item.ingredientId,
        quantity: item.quantity,
        unitId: item.unitId,
        checked: item.checked,
      })),
    );

    const syncPlan = buildGrocerySyncPlan({
      weekStartDate,
      approvedSlotCount: approvedSlots.length,
      slots: slotSources,
      catalog,
      pantryByIngredientId,
      existingGrocery,
    });

    if (syncPlan.projectedCount > MAX_GROCERY_ITEMS_PER_HOUSEHOLD) {
      throw groceryListFullError();
    }

    this.grocery.applyBuilderSync({
      creates: syncPlan.creates.map((c) => ({
        ingredientId: c.ingredientId,
        quantity: c.quantity,
        unitId: c.unitId,
      })),
      updates: syncPlan.updates.map((u) => ({
        groceryItemId: u.groceryItemId,
        quantity: u.quantity,
        unitId: u.unitId,
      })),
      deletes: syncPlan.deletes.map((d) => ({ groceryItemId: d.groceryItemId })),
      projectedCount: syncPlan.projectedCount,
    });

    const listed = this.grocery.listGroceryItems();
    return {
      groups: listed.groups,
      maxGroceryItems: listed.maxGroceryItems,
      report: syncPlan.report,
    };
  }
}
