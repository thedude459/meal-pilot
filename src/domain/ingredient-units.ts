export type IngredientUnitKind = "volume" | "mass" | "count";

export type IngredientUnit = {
  id: string;
  label: string;
  kind: IngredientUnitKind;
};

export const INGREDIENT_UNITS: readonly IngredientUnit[] = [
  { id: "tsp", label: "teaspoon", kind: "volume" },
  { id: "tbsp", label: "tablespoon", kind: "volume" },
  { id: "cup", label: "cup", kind: "volume" },
  { id: "fl_oz", label: "fluid ounce", kind: "volume" },
  { id: "ml", label: "milliliter", kind: "volume" },
  { id: "l", label: "liter", kind: "volume" },
  { id: "g", label: "gram", kind: "mass" },
  { id: "kg", label: "kilogram", kind: "mass" },
  { id: "oz", label: "ounce", kind: "mass" },
  { id: "lb", label: "pound", kind: "mass" },
  { id: "piece", label: "piece", kind: "count" },
  { id: "clove", label: "clove", kind: "count" },
  { id: "pinch", label: "pinch", kind: "count" },
  { id: "to_taste", label: "to taste", kind: "count" },
] as const;

const catalogIds = new Set(INGREDIENT_UNITS.map((u) => u.id));

export function listIngredientUnits(): IngredientUnit[] {
  return INGREDIENT_UNITS.map((u) => ({ ...u }));
}

export function isKnownIngredientUnit(id: string): boolean {
  return catalogIds.has(id);
}
