export type DietaryRestriction = {
  id: string;
  label: string;
};

export const DIETARY_RESTRICTIONS: readonly DietaryRestriction[] = [
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "pescatarian", label: "Pescatarian" },
  { id: "gluten_free", label: "Gluten-free" },
  { id: "dairy_free", label: "Dairy-free" },
  { id: "nut_free", label: "Nut-free" },
  { id: "shellfish_free", label: "Shellfish-free" },
  { id: "egg_free", label: "Egg-free" },
  { id: "soy_free", label: "Soy-free" },
  { id: "halal", label: "Halal" },
  { id: "kosher", label: "Kosher" },
  { id: "low_sodium", label: "Low sodium" },
] as const;

const catalogIds = new Set(DIETARY_RESTRICTIONS.map((r) => r.id));

export function listDietaryRestrictions(): DietaryRestriction[] {
  return DIETARY_RESTRICTIONS.map((r) => ({ ...r }));
}

export function isKnownDietaryRestriction(id: string): boolean {
  return catalogIds.has(id);
}

export function assertKnownDietaryRestrictions(ids: string[]): void {
  for (const id of ids) {
    if (!catalogIds.has(id)) {
      throw new Error(`UNKNOWN:${id}`);
    }
  }
}
