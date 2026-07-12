# Data Model: Ingredients

**Feature**: `004-ingredient` | **Date**: 2026-07-12

## Entities

### Ingredient

Household-scoped measurable food catalog entry. Identity is independent of
display name.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| householdId | string (UUID) | FK → Household; scopes catalog |
| displayName | string | Normalized; 1–80 chars; unique case-insensitively vs all household labels |
| displayNameKey | string | Normalized display name lowercased (`en-US`); unique with householdId |
| defaultUnitId | string | Must exist in Unit catalog (`ingredient-units`) |
| shoppingCategoryId | string \| null | Optional; must exist in ShoppingCategory catalog when set |
| aliases | string[] | Ordered; 0–20 after normalize; each 1–80 chars; unique rules below |
| createdAt | datetime | Set on create |
| updatedAt | datetime | Bumped on successful replace |

**Relationships**:
- Belongs to one Household
- References one Unit catalog entry via `defaultUnitId`
- Optionally references one ShoppingCategory catalog entry via
  `shoppingCategoryId`

**Label uniqueness (household-wide)**:
- Normalize every display name and alias: trim ends; collapse consecutive
  Unicode whitespace (`\s`) to one ASCII space; reject empty; max 80 chars
- Case-insensitive compare uses `en-US` lowercasing of normalized labels
- Persist `displayNameKey` from normalized display name for DB uniqueness
- No two Ingredients may share any label (display name or alias)
- On one save, no alias may equal that Ingredient’s display name
- Duplicate aliases on one save collapse to first-seen order (casing preserved)
- Conflicts → `INGREDIENT_LABEL_CONFLICT`; prior row unchanged

**Validation (on create / replace)**:
1. Normalize `displayName`; reject if empty or length > 80 →
   `VALIDATION_ERROR` / `INGREDIENT_LIMIT`
2. `defaultUnitId` must be in unit catalog → else `UNKNOWN_UNIT`
3. Normalize aliases: drop blanks; collapse case-insensitive duplicates
   first-seen; reject any alias length > 80 or count > 20 → `INGREDIENT_LIMIT`
4. If any alias equals display name (case-insensitive) →
   `INGREDIENT_LABEL_CONFLICT`
5. If `shoppingCategoryId` is non-null, must be in shopping-category catalog →
   else `UNKNOWN_SHOPPING_CATEGORY`; `null` clears (on replace, field is
   required — omit is `VALIDATION_ERROR`)
6. On replace only: `aliases` is required (may be `[]`); omit is
   `VALIDATION_ERROR`
7. Check household label set excluding self (on replace) for overlaps →
   `INGREDIENT_LABEL_CONFLICT`
8. On create only: reject if household already has 500 ingredients →
   `INGREDIENT_CATALOG_FULL`
9. Failed validation leaves prior row unchanged (replace) or inserts nothing
   (create); last successful replace wins

### ShoppingCategory (catalog)

| Field | Type | Notes |
|-------|------|-------|
| id | string | Stable slug, e.g. `produce` |
| label | string | Human-readable, e.g. "Produce" |

**Initial catalog**: see [research.md](./research.md) §6.

### Unit (catalog)

Reused from Recipes — see `003-recipe` / `src/domain/ingredient-units.ts`.
Not redefined here.

### Household (dependency)

| Field | Role for this feature |
|-------|------------------------|
| id | Scopes ingredient catalog (`DEFAULT_HOUSEHOLD_ID` in v1) |

## State Transitions

```text
[List Ingredients]
  → return all household ingredients sorted A–Z by displayName
    (case-insensitive); include maxIngredients: 500

[Get Ingredient]
  → must exist in household
  → return full Ingredient

[Create Ingredient]
  → normalize + validate + uniqueness
  → shoppingCategoryId optional (omit/null = unset); aliases optional (omit = [])
  → enforce catalog cap 500 → INGREDIENT_CATALOG_FULL if at cap
  → insert
  → on failure: no row

[Replace Ingredient]
  → must exist in household
  → require displayName, defaultUnitId, shoppingCategoryId, aliases in body
  → omit shoppingCategoryId or aliases → VALIDATION_ERROR
  → shoppingCategoryId null clears; aliases [] clears
  → normalize + validate + uniqueness (exclude self)
  → full replace mutable fields
  → on failure: prior row unchanged

[Delete Ingredient]
  → must exist in household
  → permanent delete
  → subsequent get/list omit it
```

## SQLite mapping (implementation sketch)

| Column | SQL type | Notes |
|--------|----------|-------|
| id | text PK | UUID |
| household_id | text not null | indexed |
| display_name | text not null | normalized |
| display_name_key | text not null | lowercased normalized name |
| default_unit_id | text not null | catalog id |
| shopping_category_id | text null | catalog id or null |
| aliases | text not null | JSON array |
| created_at | text/integer | ISO or unix per existing db helpers |
| updated_at | text/integer | bumped on replace |

Unique index: `(household_id, display_name_key)` for display-name safety net
(parallel to family-members). Alias uniqueness remains in `IngredientService`.

## Out of scope (non-entities here)

- Recipe ingredient lines (remain free-text on Recipe)
- PantryItem quantity / expiration
- GroceryItem list rows
- Dietary/allergen flags on Ingredient
- Recipe ↔ Ingredient ID linking
