export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  DUPLICATE_NAME: "DUPLICATE_NAME",
  MEMBER_LIMIT: "MEMBER_LIMIT",
  UNKNOWN_RESTRICTION: "UNKNOWN_RESTRICTION",
  PREFERENCE_LIMIT: "PREFERENCE_LIMIT",
  UNKNOWN_UNIT: "UNKNOWN_UNIT",
  RECIPE_LIMIT: "RECIPE_LIMIT",
  RECIPE_LIBRARY_FULL: "RECIPE_LIBRARY_FULL",
  UNKNOWN_SHOPPING_CATEGORY: "UNKNOWN_SHOPPING_CATEGORY",
  INGREDIENT_LIMIT: "INGREDIENT_LIMIT",
  INGREDIENT_CATALOG_FULL: "INGREDIENT_CATALOG_FULL",
  INGREDIENT_LABEL_CONFLICT: "INGREDIENT_LABEL_CONFLICT",
  UNIT_MISMATCH: "UNIT_MISMATCH",
  PANTRY_LIMIT: "PANTRY_LIMIT",
  PANTRY_INVENTORY_FULL: "PANTRY_INVENTORY_FULL",
  PANTRY_INGREDIENT_CONFLICT: "PANTRY_INGREDIENT_CONFLICT",
  GROCERY_LIMIT: "GROCERY_LIMIT",
  GROCERY_LIST_FULL: "GROCERY_LIST_FULL",
  GROCERY_INGREDIENT_CONFLICT: "GROCERY_INGREDIENT_CONFLICT",
  INGREDIENT_IN_USE: "INGREDIENT_IN_USE",
  WEEKLY_PLAN_CONFLICT: "WEEKLY_PLAN_CONFLICT",
  WEEKLY_PLAN_LIBRARY_FULL: "WEEKLY_PLAN_LIBRARY_FULL",
  RECIPE_IN_USE: "RECIPE_IN_USE",
  GENERATION_NO_PREFERENCES: "GENERATION_NO_PREFERENCES",
  NOT_FOUND: "NOT_FOUND",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
  }
}

export function validationError(message: string): DomainError {
  return new DomainError(ErrorCode.VALIDATION_ERROR, message, 400);
}

export function duplicateNameError(message = "A family member with this name already exists"): DomainError {
  return new DomainError(ErrorCode.DUPLICATE_NAME, message, 409);
}

export function memberLimitError(message = "Household member limit of 12 reached"): DomainError {
  return new DomainError(ErrorCode.MEMBER_LIMIT, message, 409);
}

export function unknownRestrictionError(id: string): DomainError {
  return new DomainError(
    ErrorCode.UNKNOWN_RESTRICTION,
    `Unknown dietary restriction: ${id}`,
    400,
  );
}

export function preferenceLimitError(
  message = "Preference update exceeds label length or count limits",
): DomainError {
  return new DomainError(ErrorCode.PREFERENCE_LIMIT, message, 400);
}

export function notFoundError(message = "Family member not found"): DomainError {
  return new DomainError(ErrorCode.NOT_FOUND, message, 404);
}

export function unknownUnitError(id: string): DomainError {
  return new DomainError(ErrorCode.UNKNOWN_UNIT, `Unknown ingredient unit: ${id}`, 400);
}

export function recipeLimitError(
  message = "Recipe update exceeds field length or count limits",
): DomainError {
  return new DomainError(ErrorCode.RECIPE_LIMIT, message, 400);
}

export function recipeLibraryFullError(
  message = "Household recipe library limit of 500 reached",
): DomainError {
  return new DomainError(ErrorCode.RECIPE_LIBRARY_FULL, message, 409);
}

export function unknownShoppingCategoryError(id: string): DomainError {
  return new DomainError(
    ErrorCode.UNKNOWN_SHOPPING_CATEGORY,
    `Unknown shopping category: ${id}`,
    400,
  );
}

export function ingredientLimitError(
  message = "Ingredient update exceeds field length or count limits",
): DomainError {
  return new DomainError(ErrorCode.INGREDIENT_LIMIT, message, 400);
}

export function ingredientCatalogFullError(
  message = "Household ingredient catalog limit of 500 reached",
): DomainError {
  return new DomainError(ErrorCode.INGREDIENT_CATALOG_FULL, message, 409);
}

export function ingredientLabelConflictError(
  message = "Ingredient display name or alias conflicts with an existing label",
): DomainError {
  return new DomainError(ErrorCode.INGREDIENT_LABEL_CONFLICT, message, 409);
}

export function unitMismatchError(
  message = "Pantry unit must match the ingredient default unit",
): DomainError {
  return new DomainError(ErrorCode.UNIT_MISMATCH, message, 400);
}

export function pantryLimitError(
  message = "Pantry update exceeds quantity or expiration field limits",
): DomainError {
  return new DomainError(ErrorCode.PANTRY_LIMIT, message, 400);
}

export function pantryInventoryFullError(
  message = "Household pantry inventory limit of 500 reached",
): DomainError {
  return new DomainError(ErrorCode.PANTRY_INVENTORY_FULL, message, 409);
}

export function pantryIngredientConflictError(
  message = "Pantry stock for this ingredient already exists",
): DomainError {
  return new DomainError(ErrorCode.PANTRY_INGREDIENT_CONFLICT, message, 409);
}

export function groceryLimitError(
  message = "Grocery update exceeds quantity field limits",
): DomainError {
  return new DomainError(ErrorCode.GROCERY_LIMIT, message, 400);
}

export function groceryListFullError(
  message = "Household grocery list limit of 500 reached",
): DomainError {
  return new DomainError(ErrorCode.GROCERY_LIST_FULL, message, 409);
}

export function groceryIngredientConflictError(
  message = "A grocery line for this ingredient already exists",
): DomainError {
  return new DomainError(ErrorCode.GROCERY_INGREDIENT_CONFLICT, message, 409);
}

export function ingredientInUseError(
  message = "Ingredient is referenced by pantry stock; remove the pantry item first",
): DomainError {
  return new DomainError(ErrorCode.INGREDIENT_IN_USE, message, 409);
}

export function weeklyPlanConflictError(
  message = "A weekly plan for this week-start already exists",
): DomainError {
  return new DomainError(ErrorCode.WEEKLY_PLAN_CONFLICT, message, 409);
}

export function weeklyPlanLibraryFullError(
  message = "Household weekly plan library limit of 104 reached",
): DomainError {
  return new DomainError(ErrorCode.WEEKLY_PLAN_LIBRARY_FULL, message, 409);
}

export function recipeInUseError(
  message = "Recipe is referenced by a weekly plan slot; clear the slot or delete the plan first",
): DomainError {
  return new DomainError(ErrorCode.RECIPE_IN_USE, message, 409);
}

export function generationNoPreferencesError(
  message = "At least one family member is required to generate weekly meals",
): DomainError {
  return new DomainError(ErrorCode.GENERATION_NO_PREFERENCES, message, 400);
}
