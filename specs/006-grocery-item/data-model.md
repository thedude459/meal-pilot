# Data Model: Grocery Items

**Feature**: `006-grocery-item` | **Date**: 2026-07-12

## Entities

### GroceryItem

Household-scoped shopping-list line for one catalog Ingredient.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| householdId | string (UUID) | FK → Household; scopes list |
| ingredientId | string (UUID) | FK → Ingredient; unique per household |
| ingredientDisplayName | string | Read-only on responses; from linked Ingredient |
| shoppingCategoryId | string | Read-only effective category: Ingredient `shoppingCategoryId` or `"other"` |
| shoppingCategoryLabel | string | Read-only label from shopping-categories catalog |
| quantity | number | Finite, > 0; stored rounded to ≤3 decimal places |
| unitId | string | Must equal linked Ingredient `defaultUnitId` at create/replace |
| checked | boolean | Purchased flag; create always `false`; changed only via check toggle |
| createdAt | datetime | Set on create |
| updatedAt | datetime | Bumped on successful replace or check toggle |

**Relationships**:
- Belongs to one Household
- References exactly one household catalog Ingredient
- Unit must match that Ingredient’s default unit (catalog via
  `ingredient-units`)
- Effective shopping category derived from Ingredient (catalog via
  `shopping-categories`); no per-line override

**Uniqueness**:
- At most one GroceryItem per `(householdId, ingredientId)`
- Conflicts on create → `GROCERY_INGREDIENT_CONFLICT`

**Validation (on create / replace)**:
1. `ingredientId` must exist in household (create) → else `NOT_FOUND`
2. `quantity` must be finite number > 0 → else `GROCERY_LIMIT`; round to ≤3
   decimal places via shared `roundQuantity`
3. `unitId` must be known unit → else `UNKNOWN_UNIT`
4. `unitId` must equal Ingredient `defaultUnitId` → else `UNIT_MISMATCH`
5. On replace only: `quantity` and `unitId` required; omit either →
   `VALIDATION_ERROR`. If the request body includes `ingredientId` or
   `checked`, reject with `VALIDATION_ERROR` (immutable link; checked via
   dedicated toggle only). Checked status is left unchanged on successful
   replace.
6. On create: `ingredientId`, `quantity`, `unitId` required; `checked` always
   starts `false`. If the request body includes `checked`, reject with
   `VALIDATION_ERROR` (do not ignore).
7. On create only: reject if household already has 500 grocery items →
   `GROCERY_LIST_FULL`
8. Failed validation leaves prior row unchanged (replace) or inserts nothing
   (create); last successful replace wins
9. If Ingredient `defaultUnitId` changes after grocery create, existing row is
   not auto-converted; a subsequent replace that sends the prior unit MUST
   fail with `UNIT_MISMATCH` until the client sends the new default unit

**Validation (on check toggle)**:
1. GroceryItem must exist in household → else `NOT_FOUND`
2. Body requires `checked` boolean → else `VALIDATION_ERROR`
3. Body must not include quantity/unit/ingredientId → else `VALIDATION_ERROR`
4. Sets `checked` only; quantity, unit, Ingredient unchanged; bumps
   `updatedAt`; last successful toggle wins

### Ingredient (dependency)

| Field | Role for this feature |
|-------|------------------------|
| id | Linked identity for grocery line |
| displayName | List/detail label (`ingredientDisplayName`) |
| defaultUnitId | Required unit for grocery create/replace |
| shoppingCategoryId | Optional; drives list grouping (null → `"other"`) |
| householdId | Must match grocery household |

**Delete rule**: `deleteIngredient` MUST fail with `INGREDIENT_IN_USE` (409)
while any GroceryItem **or** PantryItem references the Ingredient in that
household.

### ShoppingCategory (catalog)

Reused from Ingredients — see `src/domain/shopping-categories.ts`.
`SHOPPING_CATEGORIES` order defines list group order; `other` is last.

### Unit (catalog)

Reused from Recipes/Ingredients/PantryItems — see
`src/domain/ingredient-units.ts`. Not redefined here.

### Household (dependency)

| Field | Role for this feature |
|-------|------------------------|
| id | Scopes grocery list (`DEFAULT_HOUSEHOLD_ID` in v1) |

## State Transitions

```text
[List GroceryItems]
  → join Ingredient display names + shopping categories
  → effectiveCategory = ingredient.shoppingCategoryId ?? "other"
  → group by effectiveCategory; order groups by SHOPPING_CATEGORIES
  → within group sort A–Z by ingredientDisplayName (case-insensitive)
    regardless of checked
  → omit empty groups
  → return { groups, maxGroceryItems: 500 }

[Get GroceryItem]
  → must exist in household
  → return full GroceryItem including display name + effective category

[Create GroceryItem]
  → validate ingredient exists, quantity, unit==default
  → reject if body includes checked → VALIDATION_ERROR
  → reject duplicate ingredientId → GROCERY_INGREDIENT_CONFLICT
  → enforce list cap 500 → GROCERY_LIST_FULL if at cap
  → insert with checked=false
  → on failure: no row

[Replace GroceryItem]
  → must exist in household
  → require quantity, unitId in body
  → omit either → VALIDATION_ERROR
  → body includes ingredientId or checked → VALIDATION_ERROR
  → re-check unit against Ingredient’s current defaultUnitId
    (stale unit after defaultUnitId change → UNIT_MISMATCH)
  → full replace quantity + unit; leave checked unchanged
  → on failure: prior row unchanged

[Set GroceryItem Checked]
  → must exist in household
  → require { checked: boolean }; reject extra quantity/unit/ingredientId
  → update checked only
  → on failure: prior row unchanged

[Delete GroceryItem]
  → must exist in household
  → permanent delete
  → subsequent get/list omit it
  → unblocks Ingredient delete for that ingredientId (if no pantry row)

[Delete Ingredient] (IngredientService)
  → if pantry row exists → INGREDIENT_IN_USE (409)
  → if grocery row exists → INGREDIENT_IN_USE (409)
  → else permanent catalog delete (existing behavior)
```

## SQLite mapping (implementation sketch)

| Column | SQL type | Notes |
|--------|----------|-------|
| id | text PK | UUID |
| household_id | text not null | indexed |
| ingredient_id | text not null | references ingredients.id (service-enforced) |
| quantity | real not null | > 0; ≤3 decimal places in domain |
| unit_id | text not null | catalog id; must match ingredient default at write |
| checked | integer not null | 0 or 1; default 0 |
| created_at | text/integer | ISO or unix per existing db helpers |
| updated_at | text/integer | bumped on replace and check toggle |

Unique index: `(household_id, ingredient_id)`.

Index: `household_id` for list; optional index on `ingredient_id` for
Ingredient delete lookup.

## Out of scope (non-entities here)

- Named / multiple grocery list documents
- Quantity merge on duplicate create
- Bulk remove or bulk uncheck of checked items
- BuildGroceryList auto-generation from WeeklyPlan
- Pantry subtraction during list generation
- UpdatePantry from confirmed shopping
- Export to external services
- Unit conversion between kinds
- Inline Ingredient creation during grocery add
- Per-line shopping category override
