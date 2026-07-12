# Research: Ingredients

**Feature**: `004-ingredient` | **Date**: 2026-07-12

## 1. Persistence shape for catalog ingredients

**Decision**: Store each Ingredient as one SQLite row with columns for
`display_name`, `display_name_key` (normalized + `en-US` lowercased),
`default_unit_id`, nullable `shopping_category_id`, and a JSON text column
`aliases` (ordered string array). Index/list by `household_id`; primary key
UUID; unique index on `(household_id, display_name_key)`. Store the
organizer-facing normalized display name (after trim + whitespace collapse); do
not store a separate “raw” name.

**Rationale**: Matches JSON-array patterns from preferences/recipes; ≤20 aliases
fits comfortably; keeps migrations simple for v1; identity stays stable across
renames via UUID.

**Alternatives considered**:
- Normalized `ingredient_aliases` child table — better for SQL uniqueness, but
  unnecessary at ≤500×20 labels when service-layer checks are cheap.
- Global food ontology table — rejected by spec (household-scoped catalog only).

## 2. Label normalization

**Decision**: Shared helper `normalizeIngredientLabel(input)`:
1. Trim leading/trailing whitespace
2. Collapse consecutive Unicode whitespace (`\s`, including tabs/NBSP) to a
   single ASCII space
3. Reject if empty after normalization
4. Enforce max length 80 on the normalized string

Apply to display names and each alias before uniqueness, storage, and length
checks. Case is preserved for display (first-seen casing for collapsed duplicate
aliases); uniqueness compares with locale-independent lowercasing of the
normalized string (e.g. `label.toLocaleLowerCase("en-US")`).

**Rationale**: Clarifications require trim + collapse Unicode whitespace (`\s`);
case preservation matches PreferenceProfile / cuisine-tag first-seen casing
patterns.

**Alternatives considered**:
- Trim-only — rejected by clarification.
- Strip punctuation / plurals — rejected as too aggressive for v1.
- Force Title Case on save — unnecessary UX constraint.

## 3. Uniqueness across names and aliases

**Decision**: Within a household, the set of all normalized labels (each
ingredient’s display name plus its aliases) MUST be unique under
case-insensitive compare. On create/replace:
1. Normalize display name and aliases
2. Drop blank aliases; collapse duplicate aliases first-seen order
3. If any alias equals the display name → `INGREDIENT_LABEL_CONFLICT` (409), no
   silent drop
4. Load other ingredients’ labels in the household; if any overlap with this
   ingredient’s labels → `INGREDIENT_LABEL_CONFLICT` (409)
5. Exclude the current ingredient’s prior labels when checking replace

Persist `display_name_key` = normalized display name lowercased with
`en-US`, and enforce a unique index on `(household_id, display_name_key)`
(same pattern as family-members). Alias uniqueness remains service-enforced
across the household label set.

**Rationale**: Spec FR-003/FR-008 and clarifications; 409 mirrors
`DUPLICATE_NAME` / capacity conflicts rather than field-format 400s.
`display_name_key` matches existing household uniqueness patterns.

**Alternatives considered**:
- Unique display names only, aliases unchecked across ingredients — rejected by
  spec.
- Auto-drop conflicting aliases — rejected by clarification.
- Unique index on `lower(display_name)` expression only — less portable /
  inconsistent with family-members; rejected in favor of `display_name_key`.
- Reuse `DUPLICATE_NAME` code — weaker test targeting vs ingredient-specific
  contracts; rejected in favor of `INGREDIENT_LABEL_CONFLICT`.

## 4. List ordering

**Decision**: `listIngredients` returns items sorted A–Z by display name using
case-insensitive compare on the normalized stored name
(`localeCompare(..., "en", { sensitivity: "base" })`). No search/filter query
params in v1.

**Rationale**: Clarification Option A; supports SC-004 without search scope.

**Alternatives considered**:
- Creation-order list — weaker findability.
- Category-then-name sort — deferred; category is optional/nullable.
- Search query param — out of scope per clarification.

## 5. Unit catalog reuse

**Decision**: Reuse `src/domain/ingredient-units.ts` /
`isKnownIngredientUnit`. Field name: `defaultUnitId`. Unknown ids →
`UNKNOWN_UNIT` (400). Do not add a second unit list. Continue exposing
`GET /ingredient-units` from the Recipes routes module (ownership unchanged).

**Rationale**: FR-010; avoids catalog drift.

**Alternatives considered**:
- Ingredient-only unit subset — rejected by FR-010.
- Move `/ingredient-units` under `/ingredients` — unnecessary breaking churn.

## 6. Shopping-category catalog

**Decision**: New module `src/domain/shopping-categories.ts` with stable ids and
labels. Initial set (from spec assumptions):

| id | label |
|----|-------|
| produce | Produce |
| meat_seafood | Meat & seafood |
| dairy | Dairy |
| bakery | Bakery |
| frozen | Frozen |
| canned_jarred | Canned & jarred |
| dry_goods | Dry goods |
| spices | Spices |
| beverages | Beverages |
| other | Other |

API: optional `shoppingCategoryId` on create/replace; omit or `null` means
unset (clearing allowed on replace). Unknown non-null ids →
`UNKNOWN_SHOPPING_CATEGORY` (400). Expose `GET /shopping-categories`.

**Rationale**: FR-004/FR-009; closed catalog supports later GroceryItem grouping
without free-text category drift.

**Alternatives considered**:
- Free-text categories — rejected by FR-004.
- Require category always — rejected by clarification (optional + clearable).
- Household-custom categories — deferred.

## 7. Full replace and clearing category

**Decision**: `PUT` full-replaces `displayName`, `defaultUnitId`,
`shoppingCategoryId`, and `aliases`. On replace, all four fields are required in
the request body. `shoppingCategoryId: null` clears category; `aliases: []`
clears aliases. Omitting `shoppingCategoryId` or `aliases` on PUT is a
`VALIDATION_ERROR` (400). On create (`POST`), `shoppingCategoryId` may be
omitted or `null` (unset); `aliases` may be omitted (treated as `[]`).

OpenAPI uses separate `CreateIngredientRequest` and `ReplaceIngredientRequest`
schemas (not a shared upsert with optional clear fields).

**Rationale**: Clarification allows clear-to-unset; required fields on PUT make
full-replace semantics unambiguous and avoid omit-vs-keep footguns.

**Alternatives considered**:
- PATCH partial update — inconsistent with prior features.
- Omit-means-clear on PUT — ambiguous with transport defaults; rejected.
- Separate DELETE-category endpoint — unnecessary.

## 8. Catalog capacity and field limits

**Decision**:
- Display name / each alias: ≤80 chars after normalization →
  `INGREDIENT_LIMIT` (400)
- ≤20 aliases after normalization → `INGREDIENT_LIMIT` (400)
- ≤500 ingredients per household on create → `INGREDIENT_CATALOG_FULL` (409)
- Blank display name / missing unit → `VALIDATION_ERROR` (400)

**Rationale**: Parallel to `RECIPE_LIMIT` vs `RECIPE_LIBRARY_FULL` /
`PREFERENCE_LIMIT` vs `MEMBER_LIMIT`.

**Alternatives considered**:
- Single error code for all failures — weaker contract tests.
- Soft-delete instead of permanent remove — rejected by FR-007.

## 9. Relationship to Recipes

**Decision**: Do not change `recipe.ts` ingredient lines, OpenAPI recipe
schemas, or migrations for recipes. Catalog Ingredients are a separate table
and API. Aliases exist for future matching only.

**Rationale**: FR-013 and Recipes clarification (free-text v1).

**Alternatives considered**:
- Migrate recipe lines to catalog FKs now — rejected; out of scope and breaking.
- Dual-write free-text into catalog on recipe save — hidden coupling; rejected.

## 10. Error codes

**Decision**: Reuse `VALIDATION_ERROR`, `UNKNOWN_UNIT`, `NOT_FOUND`. Add:
- `UNKNOWN_SHOPPING_CATEGORY` (400)
- `INGREDIENT_LIMIT` (400)
- `INGREDIENT_CATALOG_FULL` (409)
- `INGREDIENT_LABEL_CONFLICT` (409) — cross-ingredient collisions and
  own-name/alias conflicts

**Rationale**: Clear SC-003/SC-005 contract targeting; status split matches prior
features.

**Alternatives considered**:
- Map label conflicts to `DUPLICATE_NAME` — overlapping semantics with members;
  rejected for ingredient-specific contracts.

## 11. Testing strategy

**Decision**: Vitest unit tests for normalize/limits/shopping catalog/own-alias
rules; integration for CRUD, A–Z order, uniqueness across aliases, clear
category, catalog-cap-at-500, reject-leaves-prior-unchanged, and
cross-household isolation (service constructor `householdId` override); contract
tests against `contracts/ingredients.openapi.yaml`.

**Rationale**: High-regression surface relative to quickstart-only smoke.

**Alternatives considered**:
- Quickstart-only — insufficient for SC-003/SC-005/SC-006/SC-007.
