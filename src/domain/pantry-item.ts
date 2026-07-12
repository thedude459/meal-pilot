import {
  pantryLimitError,
  unitMismatchError,
  unknownUnitError,
  validationError,
} from "./errors.js";
import { isKnownIngredientUnit } from "./ingredient-units.js";
import { roundQuantity } from "./quantity.js";

export const MAX_PANTRY_ITEMS_PER_HOUSEHOLD = 500;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type PantryItem = {
  id: string;
  householdId: string;
  ingredientId: string;
  ingredientDisplayName: string;
  quantity: number;
  unitId: string;
  expirationDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PantryItemCreateInput = {
  ingredientId: string;
  quantity: number;
  unitId: string;
  expirationDate?: string | null;
};

export type PantryItemReplaceInput = {
  quantity: number;
  unitId: string;
  expirationDate: string | null;
};

export type NormalizedPantryFields = {
  quantity: number;
  unitId: string;
  expirationDate: string | null;
};

/** Parse optional expiration: omit/null → null; invalid format → PANTRY_LIMIT. */
export function parseExpirationDate(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    throw pantryLimitError("expirationDate must be an ISO calendar date (YYYY-MM-DD) or null");
  }
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw pantryLimitError("expirationDate must be a valid calendar date");
  }
  return value;
}

export function normalizeQuantity(quantity: unknown): number {
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw pantryLimitError("quantity must be a finite number greater than zero");
  }
  return roundQuantity(quantity);
}

export function assertUnitMatchesDefault(unitId: string, defaultUnitId: string): void {
  if (!isKnownIngredientUnit(unitId)) {
    throw unknownUnitError(unitId || "(missing)");
  }
  if (unitId !== defaultUnitId) {
    throw unitMismatchError(
      `Pantry unit must match the ingredient default unit (${defaultUnitId})`,
    );
  }
}

export function normalizePantryItemInput(
  input: PantryItemCreateInput,
  defaultUnitId: string,
): NormalizedPantryFields {
  if (typeof input.ingredientId !== "string" || !input.ingredientId) {
    throw validationError("ingredientId is required");
  }
  const quantity = normalizeQuantity(input.quantity);
  const unitId = typeof input.unitId === "string" ? input.unitId : "";
  assertUnitMatchesDefault(unitId, defaultUnitId);
  const expirationDate = parseExpirationDate(input.expirationDate);
  return { quantity, unitId, expirationDate };
}

export function normalizePantryItemReplaceInput(
  input: PantryItemReplaceInput,
  defaultUnitId: string,
): NormalizedPantryFields {
  if (!("quantity" in input) || !("unitId" in input) || !("expirationDate" in input)) {
    throw validationError("quantity, unitId, and expirationDate are required on replace");
  }
  const quantity = normalizeQuantity(input.quantity);
  const unitId = typeof input.unitId === "string" ? input.unitId : "";
  assertUnitMatchesDefault(unitId, defaultUnitId);
  const expirationDate = parseExpirationDate(input.expirationDate);
  return { quantity, unitId, expirationDate };
}

export function assertPantryItemValid(
  fields: NormalizedPantryFields,
  defaultUnitId: string,
): void {
  assertUnitMatchesDefault(fields.unitId, defaultUnitId);
  if (fields.quantity <= 0 || !Number.isFinite(fields.quantity)) {
    throw pantryLimitError("quantity must be a finite number greater than zero");
  }
}
