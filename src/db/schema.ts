import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const familyMembers = sqliteTable(
  "family_members",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    displayName: text("display_name").notNull(),
    displayNameKey: text("display_name_key").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    uniqueNamePerHousehold: uniqueIndex("family_members_household_name_key").on(
      table.householdId,
      table.displayNameKey,
    ),
  }),
);

export const preferenceProfiles = sqliteTable(
  "preference_profiles",
  {
    id: text("id").primaryKey(),
    familyMemberId: text("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    likesJson: text("likes_json").notNull().default("[]"),
    dislikesJson: text("dislikes_json").notNull().default("[]"),
    dietaryRestrictionIdsJson: text("dietary_restriction_ids_json").notNull().default("[]"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    uniqueMember: uniqueIndex("preference_profiles_member_key").on(table.familyMemberId),
  }),
);

export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id),
  title: text("title").notNull(),
  ingredientsJson: text("ingredients_json").notNull(),
  instructionStepsJson: text("instruction_steps_json").notNull(),
  servings: integer("servings"),
  prepTimeMinutes: integer("prep_time_minutes"),
  cookTimeMinutes: integer("cook_time_minutes"),
  cuisineTagsJson: text("cuisine_tags_json").notNull().default("[]"),
  dietaryAttributeIdsJson: text("dietary_attribute_ids_json").notNull().default("[]"),
  source: text("source").notNull().default("curated"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const ingredients = sqliteTable(
  "ingredients",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    displayName: text("display_name").notNull(),
    displayNameKey: text("display_name_key").notNull(),
    defaultUnitId: text("default_unit_id").notNull(),
    shoppingCategoryId: text("shopping_category_id"),
    aliasesJson: text("aliases_json").notNull().default("[]"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    uniqueNamePerHousehold: uniqueIndex("ingredients_household_name_key").on(
      table.householdId,
      table.displayNameKey,
    ),
  }),
);

export const pantryItems = sqliteTable(
  "pantry_items",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    quantity: real("quantity").notNull(),
    unitId: text("unit_id").notNull(),
    expirationDate: text("expiration_date"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    uniqueIngredientPerHousehold: uniqueIndex("pantry_items_household_ingredient_key").on(
      table.householdId,
      table.ingredientId,
    ),
  }),
);

export const groceryItems = sqliteTable(
  "grocery_items",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    quantity: real("quantity").notNull(),
    unitId: text("unit_id").notNull(),
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    uniqueIngredientPerHousehold: uniqueIndex("grocery_items_household_ingredient_key").on(
      table.householdId,
      table.ingredientId,
    ),
  }),
);

export const weeklyPlans = sqliteTable(
  "weekly_plans",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    weekStartDate: text("week_start_date").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    uniqueWeekPerHousehold: uniqueIndex("weekly_plans_household_week_key").on(
      table.householdId,
      table.weekStartDate,
    ),
  }),
);

export const mealSlots = sqliteTable(
  "meal_slots",
  {
    id: text("id").primaryKey(),
    weeklyPlanId: text("weekly_plan_id")
      .notNull()
      .references(() => weeklyPlans.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id),
    status: text("status").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    uniqueDayPerPlan: uniqueIndex("meal_slots_plan_day_key").on(table.weeklyPlanId, table.day),
  }),
);
