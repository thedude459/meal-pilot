# Research: Pantry Items

**Feature**: `005-pantry-item` | **Date**: 2026-07-12

## 1. Persistence shape for pantry stock

**Decision**: Store each PantryItem as one SQLite row with `ingredient_id`,
`quantity` (REAL), `unit_id`, nullable `expiration_date` (TEXT `YYYY-MM-DD`),
and household scoping. Primary key UUID. Unique index on
`(household_id, ingredient_id)`. Soft DB FK to `ingredients(id)` is optional;
service-layer checks are authoritative for create and Ingredient delete.

**Rationale**: Spec requires one stock row per Ingredient per household;
aggregate quantity + optional single expiration matches clarifications; UUID
identity stays stable across quantity edits.

**Alternatives considered**:
- Multi-lot rows per Ingredient (separate expirations) — rejected by
  clarification (aggregate stock only).
- Embed quantity on `ingredients` table — rejected; constitution separates
  Ingredient identity from PantryItem stock.
- Soft-delete / zero-quantity rows — rejected; out-of-stock = hard delete.

## 2. Quantity precision

**Decision**: Extract shared `QUANTITY_DECIMAL_PLACES = 3` and `roundQuantity`
from `src/domain/recipe.ts` into `src/domain/quantity.ts`. Pantry and Recipe both
import it. Reject non-finite or ≤ 0 quantities with `VALIDATION_ERROR` (400).
No separate max magnitude beyond IEEE finite number unless tests need a
practical cap (not required by spec).

**Rationale**: Clarification Option A; keeps grocery-adjacent math consistent.

**Alternatives considered**:
- Duplicate rounding in pantry-item.ts — drift risk; rejected.
- Whole numbers only — rejected by clarification.
- Arbitrary precision strings — unnecessary for cooking quantities.

## 3. Unit must equal Ingredient default

**Decision**: On create and replace, load the linked Ingredient; require
`unitId === ingredient.defaultUnitId`. Unknown unit catalog ids →
`UNKNOWN_UNIT` (400). Known unit that is not the Ingredient default →
`UNIT_MISMATCH` (400). Do not auto-rewrite unit to default; client must send
the correct id. If Ingredient default unit later changes, existing pantry rows
keep stored `unit_id` until the next successful replace, which must use the new
default.

**Rationale**: Clarification Option B; enables future grocery subtract without
conversion.

**Alternatives considered**:
- Any catalog unit — rejected by clarification.
- Same unit kind only — still needs conversion; rejected.
- Auto-coerce to default unit — hides client bugs; rejected.

## 4. Expiration date representation

**Decision**: Store and expose `expirationDate` as ISO calendar date string
`YYYY-MM-DD` or `null`. Accept only that format (reject datetime with time,
slash formats, empty string). Past, today, and future dates are all valid. On
create, omit or `null` → unset. On PUT, `expirationDate` is required;
`null` clears; omit → `VALIDATION_ERROR`.

**Rationale**: Clarifications (any calendar date; full-replace required fields);
day precision matches constitution “MAY track expiration.”

**Alternatives considered**:
- ISO date-time — over-precise; timezone footguns.
- Reject past dates — rejected by clarification.
- Auto-purge expired rows — rejected by FR-014.

## 5. Full replace semantics

**Decision**: `PUT` requires `quantity`, `unitId`, and `expirationDate` in the
body. Separate OpenAPI `CreatePantryItemRequest` vs
`ReplacePantryItemRequest`. Create requires `ingredientId`, `quantity`,
`unitId`; `expirationDate` optional. Ingredient id is immutable after create
(not accepted on PUT).

**Rationale**: Clarification Option A; mirrors Ingredient PUT clarity.

**Alternatives considered**:
- PATCH — inconsistent with prior features.
- Omit-means-keep for expiration — rejected by clarification.

## 6. List ordering and display name

**Decision**: `listPantryItems` joins (or two-query maps) Ingredients and sorts
A–Z by Ingredient `displayName` using case-insensitive compare
(`localeCompare(..., "en", { sensitivity: "base" })`). Response includes
`ingredientId`, `ingredientDisplayName`, `quantity`, `unitId`,
`expirationDate`. No search/filter in v1.

**Rationale**: FR-005 / FR-013; supports SC-004.

**Alternatives considered**:
- Sort by expiration — deferred.
- Sort by creation time — weaker findability.

## 7. Duplicate Ingredient stock and capacity

**Decision**:
- Create when `(household_id, ingredient_id)` already exists →
  `PANTRY_INGREDIENT_CONFLICT` (409)
- Create when household already has 500 pantry items →
  `PANTRY_INVENTORY_FULL` (409)
- Error code split (400s):
  - Missing or omitted required fields (incl. PUT omit of quantity / unitId /
    expirationDate) → `VALIDATION_ERROR`
  - Non-finite or ≤ 0 quantity, or `expirationDate` present but not valid
    `YYYY-MM-DD` → `PANTRY_LIMIT`
  - Unknown unit catalog id → `UNKNOWN_UNIT`
  - Known unit that is not the Ingredient `defaultUnitId` → `UNIT_MISMATCH`
- Unknown `ingredientId` on create → `NOT_FOUND` (404) when id is well-formed
  UUID but absent in household (consistent with get-by-id patterns)

**Rationale**: Parallel to Ingredient `*_CONFLICT` / `*_FULL` / `*_LIMIT`
split.

**Alternatives considered**:
- Upsert / merge quantity on duplicate create — rejected by spec (reject
  duplicate).
- Single error code — weaker contracts.

## 8. Ingredient delete blocked while stocked

**Decision**: In `IngredientService.deleteIngredient`, before delete, query
`pantry_items` for any row with that `ingredient_id` in the household. If
present → `INGREDIENT_IN_USE` (409) with a clear message; do not cascade-delete
pantry. Pantry delete remains independent and unrestricted by Ingredient
lifecycle beyond the Ingredient needing to exist at pantry create time.

**Rationale**: Clarification Option A / FR-015.

**Alternatives considered**:
- Cascade delete pantry — rejected by clarification.
- Orphan pantry rows — rejected by clarification.
- Only document the rule without enforcing in IngredientService — would leave
  FR-015 untestable; rejected.

## 9. Shared quantity helper extraction

**Decision**: Move `QUANTITY_DECIMAL_PLACES` and `roundQuantity` to
`src/domain/quantity.ts`; update `recipe.ts` imports. Keep behavior identical
so existing recipe tests continue to pass.

**Rationale**: Avoid duplicating rounding; pantry and recipe share the same
clarified rule.

**Alternatives considered**:
- Import roundQuantity from recipe.ts into pantry — wrong dependency direction
  (inventory should not depend on recipe module).

## 10. Out of scope confirmation

**Decision**: Do not implement UpdatePantry, BuildGroceryList subtraction,
multi-lot stock, unit conversion, inline Ingredient create, or expiration-based
auto-delete. Those constitution consumers remain mandatory follow-on features
(see plan **Follow-on features**).

**Rationale**: Spec FR-011 / FR-012 and assumptions.
