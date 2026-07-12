export type ShoppingCategory = {
  id: string;
  label: string;
};

export const SHOPPING_CATEGORIES: readonly ShoppingCategory[] = [
  { id: "produce", label: "Produce" },
  { id: "meat_seafood", label: "Meat & seafood" },
  { id: "dairy", label: "Dairy" },
  { id: "bakery", label: "Bakery" },
  { id: "frozen", label: "Frozen" },
  { id: "canned_jarred", label: "Canned & jarred" },
  { id: "dry_goods", label: "Dry goods" },
  { id: "spices", label: "Spices" },
  { id: "beverages", label: "Beverages" },
  { id: "other", label: "Other" },
] as const;

const catalogIds = new Set(SHOPPING_CATEGORIES.map((c) => c.id));

export function listShoppingCategories(): ShoppingCategory[] {
  return SHOPPING_CATEGORIES.map((c) => ({ ...c }));
}

export function isKnownShoppingCategory(id: string): boolean {
  return catalogIds.has(id);
}
