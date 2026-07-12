import {
  groceryLimitError,
  unitMismatchError,
  unknownUnitError,
  validationError,
} from "./errors.js";
import { isKnownIngredientUnit } from "./ingredient-units.js";
import { roundQuantity } from "./quantity.js";
import {
  isKnownShoppingCategory,
  SHOPPING_CATEGORIES,
  type ShoppingCategory,
} from "./shopping-categories.js";

export const MAX_GROCERY_ITEMS_PER_HOUSEHOLD = 500;

export type GroceryItem = {
  id: string;
  householdId: string;
  ingredientId: string;
  ingredientDisplayName: string;
  shoppingCategoryId: string;
  shoppingCategoryLabel: string;
  quantity: number;
  unitId: string;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GroceryCategoryGroup = {
  shoppingCategoryId: string;
  shoppingCategoryLabel: string;
  items: GroceryItem[];
};

export type GroceryItemCreateInput = {
  ingredientId: string;
  quantity: number;
  unitId: string;
};

export type GroceryItemReplaceInput = {
  quantity: number;
  unitId: string;
};

export type NormalizedGroceryFields = {
  quantity: number;
  unitId: string;
};

export function normalizeGroceryQuantity(quantity: unknown): number {
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw groceryLimitError("quantity must be a finite number greater than zero");
  }
  return roundQuantity(quantity);
}

export function assertGroceryUnitMatchesDefault(unitId: string, defaultUnitId: string): void {
  if (!isKnownIngredientUnit(unitId)) {
    throw unknownUnitError(unitId || "(missing)");
  }
  if (unitId !== defaultUnitId) {
    throw unitMismatchError(
      `Grocery unit must match the ingredient default unit (${defaultUnitId})`,
    );
  }
}

export function effectiveShoppingCategory(
  shoppingCategoryId: string | null | undefined,
): ShoppingCategory {
  if (shoppingCategoryId && isKnownShoppingCategory(shoppingCategoryId)) {
    const found = SHOPPING_CATEGORIES.find((c) => c.id === shoppingCategoryId);
    if (found) {
      return { ...found };
    }
  }
  const other = SHOPPING_CATEGORIES.find((c) => c.id === "other");
  return other ? { ...other } : { id: "other", label: "Other" };
}

/** Group items by catalog order; omit empty groups; A–Z within group ignoring checked. */
export function groupGroceryItems(items: GroceryItem[]): GroceryCategoryGroup[] {
  const byCategory = new Map<string, GroceryItem[]>();
  for (const item of items) {
    const list = byCategory.get(item.shoppingCategoryId) ?? [];
    list.push(item);
    byCategory.set(item.shoppingCategoryId, list);
  }

  const groups: GroceryCategoryGroup[] = [];
  for (const category of SHOPPING_CATEGORIES) {
    const groupItems = byCategory.get(category.id);
    if (!groupItems || groupItems.length === 0) {
      continue;
    }
    groupItems.sort((a, b) =>
      a.ingredientDisplayName.localeCompare(b.ingredientDisplayName, "en", {
        sensitivity: "base",
      }),
    );
    groups.push({
      shoppingCategoryId: category.id,
      shoppingCategoryLabel: category.label,
      items: groupItems,
    });
  }
  return groups;
}

export function normalizeGroceryItemCreateInput(
  input: GroceryItemCreateInput & { checked?: unknown },
  defaultUnitId: string,
): NormalizedGroceryFields {
  if ("checked" in input && input.checked !== undefined) {
    throw validationError("checked cannot be set on create");
  }
  if (typeof input.ingredientId !== "string" || !input.ingredientId) {
    throw validationError("ingredientId is required");
  }
  const quantity = normalizeGroceryQuantity(input.quantity);
  const unitId = typeof input.unitId === "string" ? input.unitId : "";
  assertGroceryUnitMatchesDefault(unitId, defaultUnitId);
  return { quantity, unitId };
}

export function normalizeGroceryItemReplaceInput(
  input: GroceryItemReplaceInput & { checked?: unknown; ingredientId?: unknown },
  defaultUnitId: string,
): NormalizedGroceryFields {
  if ("checked" in input && input.checked !== undefined) {
    throw validationError("checked cannot be changed on quantity/unit replace");
  }
  if ("ingredientId" in input && input.ingredientId !== undefined) {
    throw validationError("ingredientId cannot be changed on replace");
  }
  if (!("quantity" in input) || !("unitId" in input)) {
    throw validationError("quantity and unitId are required on replace");
  }
  const quantity = normalizeGroceryQuantity(input.quantity);
  const unitId = typeof input.unitId === "string" ? input.unitId : "";
  assertGroceryUnitMatchesDefault(unitId, defaultUnitId);
  return { quantity, unitId };
}

export function normalizeSetCheckedInput(input: { checked?: unknown }): boolean {
  if (!("checked" in input) || typeof input.checked !== "boolean") {
    throw validationError("checked boolean is required");
  }
  const keys = Object.keys(input as object);
  if (keys.some((k) => k !== "checked")) {
    throw validationError("checked toggle accepts only the checked field");
  }
  return input.checked;
}
