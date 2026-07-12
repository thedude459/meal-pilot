import {
  pantryInventoryFullError,
  unitMismatchError,
  updatePantryNoCheckedError,
  validationError,
} from "./errors.js";
import { utcToday } from "./grocery-list-builder.js";
import { MAX_PANTRY_ITEMS_PER_HOUSEHOLD } from "./pantry-item.js";
import { roundQuantity } from "./quantity.js";

export type PantryManagerIngredient = {
  id: string;
  displayName: string;
  defaultUnitId: string;
};

export type PantryManagerPantryRow = {
  id: string;
  ingredientId: string;
  quantity: number;
  unitId: string;
  expirationDate: string | null;
};

export type PantryManagerGroceryLine = {
  id: string;
  ingredientId: string;
  quantity: number;
  unitId: string;
  checked: boolean;
};

export type AppliedEntry = {
  ingredientId: string;
  ingredientDisplayName: string;
  action: "created" | "increased";
  currentQuantity: number | null;
  groceryQuantity: number;
  resultingQuantity: number;
  unitId: string;
};

export type ExpiredRemovedEntry = {
  pantryItemId: string;
  ingredientId: string;
  ingredientDisplayName: string;
  quantity: number;
  unitId: string;
  expirationDate: string;
};

export type ApplyReport = {
  removeExpired: boolean;
  applied: AppliedEntry[];
  expiredRemoved: ExpiredRemovedEntry[];
  appliedCount: number;
  expiredRemovedCount: number;
};

export type PantryApplyPlan = {
  report: ApplyReport;
  deletePantryIds: string[];
  creates: { ingredientId: string; quantity: number; unitId: string }[];
  updates: {
    pantryItemId: string;
    quantity: number;
    unitId: string;
    expirationDate: string | null;
  }[];
  deleteGroceryIds: string[];
};

function displayNameSort(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

/** True when expirationDate is set and strictly before today UTC. */
export function isExpiredPantry(
  expirationDate: string | null,
  todayUtc: string,
): boolean {
  return expirationDate !== null && expirationDate < todayUtc;
}

export function projectUpdatePantry(input: {
  removeExpired: boolean;
  checkedGroceries: PantryManagerGroceryLine[];
  pantryRows: PantryManagerPantryRow[];
  ingredientsById: Map<string, PantryManagerIngredient>;
  todayUtc?: string;
  /** When true, require ≥1 checked (confirm). Preview allows zero. */
  requireChecked: boolean;
}): PantryApplyPlan {
  const todayUtc = input.todayUtc ?? utcToday();
  const removeExpired = input.removeExpired;

  if (input.requireChecked && input.checkedGroceries.length === 0) {
    throw updatePantryNoCheckedError();
  }

  const expiredRemoved: ExpiredRemovedEntry[] = [];
  const remaining = new Map<string, PantryManagerPantryRow>();

  for (const row of input.pantryRows) {
    if (removeExpired && isExpiredPantry(row.expirationDate, todayUtc)) {
      const ingredient = input.ingredientsById.get(row.ingredientId);
      expiredRemoved.push({
        pantryItemId: row.id,
        ingredientId: row.ingredientId,
        ingredientDisplayName: ingredient?.displayName ?? row.ingredientId,
        quantity: row.quantity,
        unitId: row.unitId,
        expirationDate: row.expirationDate!,
      });
    } else {
      remaining.set(row.ingredientId, { ...row });
    }
  }

  expiredRemoved.sort((a, b) =>
    displayNameSort(a.ingredientDisplayName, b.ingredientDisplayName),
  );

  const deletePantryIds = expiredRemoved.map((e) => e.pantryItemId);
  const creates: PantryApplyPlan["creates"] = [];
  const updates: PantryApplyPlan["updates"] = [];
  const deleteGroceryIds: string[] = [];
  const applied: AppliedEntry[] = [];

  const checkedSorted = [...input.checkedGroceries].sort((a, b) => {
    const nameA = input.ingredientsById.get(a.ingredientId)?.displayName ?? a.ingredientId;
    const nameB = input.ingredientsById.get(b.ingredientId)?.displayName ?? b.ingredientId;
    return displayNameSort(nameA, nameB);
  });

  for (const line of checkedSorted) {
    const ingredient = input.ingredientsById.get(line.ingredientId);
    if (!ingredient) {
      throw validationError(`Unknown ingredient: ${line.ingredientId}`);
    }
    if (line.unitId !== ingredient.defaultUnitId) {
      throw unitMismatchError(
        `Grocery unit must match the ingredient default unit (${ingredient.defaultUnitId})`,
      );
    }

    const groceryQuantity = roundQuantity(line.quantity);
    if (!(groceryQuantity > 0) || !Number.isFinite(groceryQuantity)) {
      throw validationError("Grocery quantity must be a finite number greater than zero");
    }

    const existing = remaining.get(line.ingredientId);
    const currentQuantity = existing ? existing.quantity : null;

    if (!existing) {
      const resultingQuantity = groceryQuantity;
      creates.push({
        ingredientId: line.ingredientId,
        quantity: resultingQuantity,
        unitId: ingredient.defaultUnitId,
      });
      remaining.set(line.ingredientId, {
        id: "",
        ingredientId: line.ingredientId,
        quantity: resultingQuantity,
        unitId: ingredient.defaultUnitId,
        expirationDate: null,
      });
      applied.push({
        ingredientId: line.ingredientId,
        ingredientDisplayName: ingredient.displayName,
        action: "created",
        currentQuantity: null,
        groceryQuantity,
        resultingQuantity,
        unitId: ingredient.defaultUnitId,
      });
    } else {
      const resultingQuantity = roundQuantity(existing.quantity + groceryQuantity);
      if (!(resultingQuantity > 0) || !Number.isFinite(resultingQuantity)) {
        throw validationError("Resulting pantry quantity must be a finite number greater than zero");
      }
      updates.push({
        pantryItemId: existing.id,
        quantity: resultingQuantity,
        unitId: ingredient.defaultUnitId,
        expirationDate: existing.expirationDate,
      });
      existing.quantity = resultingQuantity;
      applied.push({
        ingredientId: line.ingredientId,
        ingredientDisplayName: ingredient.displayName,
        action: "increased",
        currentQuantity,
        groceryQuantity,
        resultingQuantity,
        unitId: ingredient.defaultUnitId,
      });
    }

    deleteGroceryIds.push(line.id);
  }

  const pantryCountAfterCleanup = input.pantryRows.length - deletePantryIds.length;
  if (pantryCountAfterCleanup + creates.length > MAX_PANTRY_ITEMS_PER_HOUSEHOLD) {
    throw pantryInventoryFullError();
  }

  applied.sort((a, b) => displayNameSort(a.ingredientDisplayName, b.ingredientDisplayName));

  const report: ApplyReport = {
    removeExpired,
    applied,
    expiredRemoved,
    appliedCount: applied.length,
    expiredRemovedCount: expiredRemoved.length,
  };

  return {
    report,
    deletePantryIds,
    creates,
    updates,
    deleteGroceryIds,
  };
}
