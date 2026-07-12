# Research: Grocery Items

**Feature**: `006-grocery-item` | **Date**: 2026-07-12

## 1. Persistence shape for grocery lines

**Decision**: Store each GroceryItem as one SQLite row with `ingredient_id`,
`quantity` (REAL), `unit_id`, `checked` (INTEGER 0/1), and household scoping.
Primary key UUID. Unique index on `(household_id, ingredient_id)`. Soft DB FK to
`ingredients(id)` is optional; service-layer checks are authoritative for create
and Ingredient delete.

**Rationale**: Spec requires one grocery line per Ingredient per household;
UUID identity stays stable across quantity and check edits.

**Alternatives considered**:
- Multiple lines per Ingredient — rejected by clarification (reject duplicate).
- Parent `grocery_lists` document table — rejected; v1 is a single active
  household list (flat GroceryItems).
- Soft-delete / zero-quantity rows — rejected; remove need = hard delete.

## 2. Quantity precision

**Decision**: Reuse `QUANTITY_DECIMAL_PLACES` and `roundQuantity` from
`src/domain/quantity.ts` (already extracted in `005`). Reject non-finite or ≤ 0
quantities with `VALIDATION_ERROR` for missing/non-number shapes and
`GROCERY_LIMIT` for non-finite / ≤ 0 after type checks (mirror pantry split).

**Rationale**: Same rule as Recipes and PantryItems; grocery-adjacent math
stays consistent.

**Alternatives considered**:
- Duplicate rounding in grocery-item.ts — drift risk; rejected.
- Whole numbers only — inconsistent with prior features.

## 3. Unit must equal Ingredient default

**Decision**: On create and replace, load the linked Ingredient; require
`unitId === ingredient.defaultUnitId`. Unknown unit catalog ids →
`UNKNOWN_UNIT` (400). Known unit that is not the Ingredient default →
`UNIT_MISMATCH` (400). Do not auto-rewrite unit to default. If Ingredient
default unit later changes, existing grocery rows keep stored `unit_id` until
the next successful replace, which must use the new default.

**Rationale**: Aligns with PantryItem; enables future BuildGroceryList merge
without conversion.

**Alternatives considered**:
- Any catalog unit — rejected by spec.
- Auto-coerce to default — hides client bugs; rejected.

## 4. Dedicated check toggle vs full replace

**Decision**:
- `PUT /grocery-items/{id}` full-replaces `quantity` + `unitId` only. Both
  required. Body must not include `checked` or `ingredientId` (presence →
  `VALIDATION_ERROR`). Checked status is left unchanged.
- `PUT /grocery-items/{id}/checked` with body `{ "checked": boolean }` is the
  only way to change purchased status. Does not accept quantity/unit.
- Create always starts `checked: false`. Client MUST NOT send `checked` on
  create; presence → `VALIDATION_ERROR`.

**Rationale**: Clarification Option B; shopping check-off is frequent without
resending quantity/unit. Spec post-analyze: create forbids `checked`; FR-002
omit rules apply only to create and quantity/unit replace.

**Alternatives considered**:
- Checked on full replace only — rejected by clarification.
- PATCH with arbitrary fields — inconsistent with prior full-replace style.
- Create with optional checked — unnecessary; new lines are shopping needs.

## 5. Duplicate Ingredient add

**Decision**: Create when `(household_id, ingredient_id)` already exists →
`GROCERY_INGREDIENT_CONFLICT` (409). No quantity merge on create. Organizer
updates quantity via PUT replace.

**Rationale**: Clarification Option A; mirrors PantryItem conflict semantics.
Quantity merge across meals remains BuildGroceryList’s job later.

**Alternatives considered**:
- Merge quantities on duplicate create — rejected by clarification.
- Upsert — rejected by clarification.

## 6. List grouping and ordering

**Decision**: `listGroceryItems` joins Ingredients, computes effective category
as `ingredient.shoppingCategoryId ?? "other"` (must be a known catalog id or
fall through to `"other"`), groups items, orders groups by
`SHOPPING_CATEGORIES` array order (catalog already ends with `other`), and
within each group sorts A–Z by Ingredient `displayName` with
`localeCompare(..., "en", { sensitivity: "base" })` regardless of `checked`.
Omit empty groups. Response shape is nested `groups[]` with category id/label
and items; include `maxGroceryItems: 500`. No search/filter; no bulk clear.

**Rationale**: Clarifications on catalog group order, Other last, and A–Z
independent of checked status; FR-005 / FR-015.

**Alternatives considered**:
- Flat list only — weaker match to “grouped by category” acceptance.
- A–Z category labels — rejected by clarification (catalog order).
- Checked items sink to bottom — rejected by clarification.
- Persist category override on GroceryItem — rejected by FR-015.

## 7. Capacity and error code split

**Decision**:
- Create when household already has 500 grocery items → `GROCERY_LIST_FULL`
  (409)
- Error code split (400s):
  - Missing/omitted required fields; PUT includes `checked` or `ingredientId`;
    create missing `ingredientId`/`quantity`/`unitId` → `VALIDATION_ERROR`
  - Non-finite or ≤ 0 quantity → `GROCERY_LIMIT`
  - Unknown unit catalog id → `UNKNOWN_UNIT`
  - Known unit ≠ Ingredient `defaultUnitId` → `UNIT_MISMATCH`
- Unknown `ingredientId` on create → `NOT_FOUND` (404) when well-formed UUID
  but absent in household

**Rationale**: Parallel to PantryItem / Ingredient conflict / full / limit split.

**Alternatives considered**:
- Single error code — weaker contracts.

## 8. Ingredient delete blocked while on grocery list

**Decision**: Add `assertIngredientNotInGrocery` (in grocery-item-service,
mirroring pantry). Call it from `IngredientService.deleteIngredient` after (or
alongside) `assertIngredientNotInPantry`. If a grocery row exists →
`INGREDIENT_IN_USE` (409); do not cascade-delete grocery lines. Same error code
as pantry-in-use so clients treat “referenced by inventory or list” uniformly.

**Rationale**: FR-014; pantry already established `INGREDIENT_IN_USE`.

**Alternatives considered**:
- Separate `INGREDIENT_ON_GROCERY_LIST` code — more precise but fragments client
  handling; rejected for v1 consistency with pantry.
- Cascade delete grocery — rejected by spec.
- Orphan grocery rows — rejected by spec.

## 9. Bulk clear checked

**Decision**: Do not implement remove-all-checked or uncheck-all endpoints.

**Rationale**: Clarification Option A; individual delete / toggle only.

**Alternatives considered**:
- Bulk delete checked — rejected by clarification.
- Bulk uncheck — rejected by clarification.

## 10. Out of scope confirmation

**Decision**: Do not implement BuildGroceryList from WeeklyPlan, pantry
subtraction during generation, UpdatePantry after confirmation, export,
quantity-merge on add, multi-list documents, unit conversion, or inline
Ingredient create. Those constitution consumers remain mandatory follow-on
features (see plan **Follow-on features**).

**Rationale**: Spec FR-011 / FR-012 and assumptions.
