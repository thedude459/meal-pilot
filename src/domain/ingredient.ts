import {
  ingredientLabelConflictError,
  ingredientLimitError,
  unknownShoppingCategoryError,
  unknownUnitError,
  validationError,
} from "./errors.js";
import { isKnownIngredientUnit } from "./ingredient-units.js";
import { isKnownShoppingCategory } from "./shopping-categories.js";

export type IngredientInput = {
  displayName: string;
  defaultUnitId: string;
  shoppingCategoryId?: string | null;
  aliases?: string[];
};

export type IngredientReplaceInput = {
  displayName: string;
  defaultUnitId: string;
  shoppingCategoryId: string | null;
  aliases: string[];
};

export type Ingredient = {
  id: string;
  householdId: string;
  displayName: string;
  defaultUnitId: string;
  shoppingCategoryId: string | null;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
};

export const MAX_LABEL_LENGTH = 80;
export const MAX_ALIASES = 20;
export const MAX_INGREDIENTS_PER_HOUSEHOLD = 500;

/** Trim ends and collapse consecutive Unicode whitespace to one ASCII space. */
export function normalizeIngredientLabel(input: string): string {
  return input.trim().replace(/\s+/gu, " ");
}

export function toDisplayNameKey(normalizedDisplayName: string): string {
  return normalizedDisplayName.toLocaleLowerCase("en-US");
}

export function labelKey(normalizedLabel: string): string {
  return normalizedLabel.toLocaleLowerCase("en-US");
}

export type NormalizedIngredientFields = {
  displayName: string;
  displayNameKey: string;
  defaultUnitId: string;
  shoppingCategoryId: string | null;
  aliases: string[];
};

function normalizeAliases(raw: string[] | undefined): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw validationError("Aliases must be an array");
  }
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      throw validationError("Alias must be a string");
    }
    const normalized = normalizeIngredientLabel(item);
    if (!normalized) continue;
    if (normalized.length > MAX_LABEL_LENGTH) {
      throw ingredientLimitError(`Alias must be at most ${MAX_LABEL_LENGTH} characters`);
    }
    const key = labelKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(normalized);
  }
  if (aliases.length > MAX_ALIASES) {
    throw ingredientLimitError(`At most ${MAX_ALIASES} aliases are allowed`);
  }
  return aliases;
}

function normalizeShoppingCategoryId(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value) {
    throw validationError("shoppingCategoryId must be a string or null");
  }
  if (!isKnownShoppingCategory(value)) {
    throw unknownShoppingCategoryError(value);
  }
  return value;
}

/** Normalize and validate create input (category/aliases optional). */
export function normalizeIngredientInput(input: IngredientInput): NormalizedIngredientFields {
  if (typeof input.displayName !== "string") {
    throw validationError("Display name is required");
  }
  const displayName = normalizeIngredientLabel(input.displayName);
  if (!displayName) {
    throw validationError("Display name is required");
  }
  if (displayName.length > MAX_LABEL_LENGTH) {
    throw ingredientLimitError(`Display name must be at most ${MAX_LABEL_LENGTH} characters`);
  }

  if (typeof input.defaultUnitId !== "string" || !input.defaultUnitId) {
    throw validationError("Default unit is required");
  }
  if (!isKnownIngredientUnit(input.defaultUnitId)) {
    throw unknownUnitError(input.defaultUnitId);
  }

  const aliases = normalizeAliases(input.aliases);
  const displayKey = labelKey(displayName);
  for (const alias of aliases) {
    if (labelKey(alias) === displayKey) {
      throw ingredientLabelConflictError("Alias must not match the ingredient display name");
    }
  }

  return {
    displayName,
    displayNameKey: toDisplayNameKey(displayName),
    defaultUnitId: input.defaultUnitId,
    shoppingCategoryId: normalizeShoppingCategoryId(input.shoppingCategoryId),
    aliases,
  };
}

/** Normalize and validate replace input (category + aliases required). */
export function normalizeIngredientReplaceInput(
  input: IngredientReplaceInput,
): NormalizedIngredientFields {
  if (!("shoppingCategoryId" in input)) {
    throw validationError("shoppingCategoryId is required on replace");
  }
  if (!("aliases" in input) || input.aliases === undefined) {
    throw validationError("aliases is required on replace");
  }
  return normalizeIngredientInput({
    displayName: input.displayName,
    defaultUnitId: input.defaultUnitId,
    shoppingCategoryId: input.shoppingCategoryId,
    aliases: input.aliases,
  });
}

/** All label keys claimed by this ingredient (display name + aliases). */
export function ingredientLabelKeys(fields: NormalizedIngredientFields): string[] {
  return [fields.displayNameKey, ...fields.aliases.map(labelKey)];
}

export function assertNoLabelOverlap(
  candidateKeys: string[],
  occupiedKeys: Iterable<string>,
): void {
  const occupied = occupiedKeys instanceof Set ? occupiedKeys : new Set(occupiedKeys);
  for (const key of candidateKeys) {
    if (occupied.has(key)) {
      throw ingredientLabelConflictError(
        "Ingredient display name or alias conflicts with an existing label",
      );
    }
  }
}
