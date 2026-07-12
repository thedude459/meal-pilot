# Data Model: Pantry Items

**Feature**: `005-pantry-item` | **Date**: 2026-07-12

## Entities

### PantryItem

Household-scoped on-hand stock for one catalog Ingredient.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| householdId | string (UUID) | FK → Household; scopes inventory |
| ingredientId | string (UUID) | FK → Ingredient; unique per household |
| ingredientDisplayName | string | Read-only on responses; from linked Ingredient |
| quantity | number | Finite, > 0; stored rounded to ≤3 decimal places |
| unitId | string | Must equal linked Ingredient `defaultUnitId` at create/replace |
| expirationDate | string \| null | ISO `YYYY-MM-DD` or null |
| createdAt | datetime | Set on create |
| updatedAt | datetime | Bumped on successful replace |

**Relationships**:
- Belongs to one Household
- References exactly one household catalog Ingredient
- Unit must match that Ingredient’s default unit (catalog via
  `ingredient-units`)

**Uniqueness**:
- At most one PantryItem per `(householdId, ingredientId)`
- Conflicts on create → `PANTRY_INGREDIENT_CONFLICT`

**Validation (on create / replace)**:
1. `ingredientId` must exist in household (create) → else `NOT_FOUND`
2. `quantity` must be finite number > 0 → else `PANTRY_LIMIT`; round to ≤3
   decimal places via shared `roundQuantity`
3. `unitId` must be known unit → else `UNKNOWN_UNIT`
4. `unitId` must equal Ingredient `defaultUnitId` → else `UNIT_MISMATCH`
5. `expirationDate` when non-null must match `YYYY-MM-DD` → else
   `PANTRY_LIMIT`; past/today/future all allowed
6. On replace only: `quantity`, `unitId`, and `expirationDate` required;
   omit any → `VALIDATION_ERROR`; `expirationDate: null` clears. If the request
   body includes `ingredientId`, reject with `VALIDATION_ERROR` (immutable link;
   do not silently ignore).
7. On create: `expirationDate` optional (omit/`null` = unset); `ingredientId`
   required and immutable thereafter
8. On create only: reject if household already has 500 pantry items →
   `PANTRY_INVENTORY_FULL`
9. Failed validation leaves prior row unchanged (replace) or inserts nothing
   (create); last successful replace wins
10. If Ingredient `defaultUnitId` changes after pantry create, existing row is
    not auto-converted; a subsequent replace that sends the prior unit MUST
    fail with `UNIT_MISMATCH` until the client sends the new default unit

### Ingredient (dependency)

| Field | Role for this feature |
|-------|------------------------|
| id | Linked identity for stock |
| displayName | List/detail label (`ingredientDisplayName`) |
| defaultUnitId | Required unit for pantry create/replace |
| householdId | Must match pantry household |

**Delete rule**: `deleteIngredient` MUST fail with `INGREDIENT_IN_USE` (409)
while any PantryItem references the Ingredient in that household.

### Unit (catalog)

Reused from Recipes/Ingredients — see `src/domain/ingredient-units.ts`.
Not redefined here.

### Household (dependency)

| Field | Role for this feature |
|-------|------------------------|
| id | Scopes pantry inventory (`DEFAULT_HOUSEHOLD_ID` in v1) |

## State Transitions

```text
[List PantryItems]
  → join Ingredient display names
  → return all household pantry items sorted A–Z by ingredientDisplayName
    (case-insensitive); include maxPantryItems: 500

[Get PantryItem]
  → must exist in household
  → return full PantryItem including ingredientDisplayName

[Create PantryItem]
  → validate ingredient exists, quantity, unit==default, optional expiration
  → reject duplicate ingredientId → PANTRY_INGREDIENT_CONFLICT
  → enforce inventory cap 500 → PANTRY_INVENTORY_FULL if at cap
  → insert
  → on failure: no row

[Replace PantryItem]
  → must exist in household
  → require quantity, unitId, expirationDate in body
  → omit any → VALIDATION_ERROR
  → body includes ingredientId → VALIDATION_ERROR (immutable)
  → expirationDate null clears
  → re-check unit against Ingredient’s current defaultUnitId
    (stale unit after defaultUnitId change → UNIT_MISMATCH)
  → full replace mutable fields
  → on failure: prior row unchanged

[Delete PantryItem]
  → must exist in household
  → permanent delete
  → subsequent get/list omit it
  → unblocks Ingredient delete for that ingredientId

[Delete Ingredient] (IngredientService)
  → if pantry row exists for ingredient → INGREDIENT_IN_USE (409)
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
| expiration_date | text null | `YYYY-MM-DD` or null |
| created_at | text/integer | ISO or unix per existing db helpers |
| updated_at | text/integer | bumped on replace |

Unique index: `(household_id, ingredient_id)`.

Index: `household_id` for list; optional index on `ingredient_id` for
Ingredient delete lookup.

## Out of scope (non-entities here)

- Multi-lot / per-purchase expiration rows
- UpdatePantry automatic increments from grocery confirmation
- BuildGroceryList pantry subtraction
- Unit conversion between kinds
- Inline Ingredient creation during pantry add
- Automatic purge of expired stock
