# Research: Recipes

**Feature**: `003-recipe` | **Date**: 2026-07-12

## 1. Persistence shape for ordered recipe lines

**Decision**: Store each Recipe as one SQLite row with JSON text columns for
`ingredients`, `instruction_steps`, `cuisine_tags`, and `dietary_attribute_ids`.
Index/list by `household_id`; primary key UUID; no unique constraint on title.

**Rationale**: Matches existing preference-profile JSON column pattern; preserves
order without join tables; fits ≤60 ingredients / ≤40 steps comfortably; keeps
migrations simple for v1.

**Alternatives considered**:
- Normalized `recipe_ingredients` / `recipe_steps` tables — better for
  cross-recipe grocery SQL later, but premature while grocery owns merge logic
  and names are free-text.
- Document store / separate DB — unjustified for local single-household service.

## 2. Shared hybrid schema and source field

**Decision**: Domain `Recipe` type always includes `source: "curated" | "ai"`.
Create/replace in this feature force `source = "curated"` and reject client
attempts to set `ai`. AI generation is not implemented; the field exists so
future `RecipeHybridEngine` emitters share one contract (FR-008, FR-009).

**Rationale**: Constitution Hybrid Recipe Sourcing requires one schema; locking
`source` now prevents a curated-only shape from becoming a breaking change.

**Alternatives considered**:
- Omit `source` until AI exists — deferred schema churn; rejected.
- Allow organizers to mark recipes as AI — violates curated-path clarity;
  rejected.

## 3. Unit catalog

**Decision**: Predefined catalog in `src/domain/ingredient-units.ts` with stable
ids and labels. Initial set:

| id | label | kind |
|----|-------|------|
| tsp | teaspoon | volume |
| tbsp | tablespoon | volume |
| cup | cup | volume |
| fl_oz | fluid ounce | volume |
| ml | milliliter | volume |
| l | liter | volume |
| g | gram | mass |
| kg | kilogram | mass |
| oz | ounce | mass |
| lb | pound | mass |
| piece | piece | count |
| clove | clove | count |
| pinch | pinch | count |
| to_taste | to taste | count |

Unknown unit ids reject the entire create/replace (`UNKNOWN_UNIT`). Expose
`GET /ingredient-units` for organizers.

**Rationale**: FR-016 requires a catalog; common cooking units cover v1 without
custom units. `to_taste` still requires a positive quantity in schema (e.g. `1`)
for uniformity—organizers may use `1` + `to_taste`.

**Alternatives considered**:
- Free-text units — rejected by clarification/spec.
- Full USDA unit ontology — overkill for v1.
- Allow zero quantity for `to_taste` — special-case complexity; rejected.

## 4. Quantity representation

**Decision**: JSON number, must be finite and `> 0`. Decimals allowed. Reject
zero, negative, NaN, Infinity. Cap display/storage precision at 3 decimal places
on normalize (round half-up) to avoid float noise in tests; do not convert to
fractions in the API.

**Rationale**: Clarification allows positive decimals; 3-decimal cap keeps
grocery-ready values stable without inventing fraction UX in v1.

**Alternatives considered**:
- Integers only — rejected by clarification.
- Arbitrary-precision decimal strings — unnecessary for cooking quantities.
- Fraction objects in API — UI concern; deferred.

## 5. Dietary tags vs PreferenceProfile catalog

**Decision**: Reuse `dietary-restrictions.ts` / `isKnownDietaryRestriction`.
Recipe field name in domain/API: `dietaryAttributeIds` (same ID space as
`dietaryRestrictionIds` on profiles). Collapse duplicate IDs first-seen order.
Reuse `UNKNOWN_RESTRICTION` error code for unknown ids.

**Rationale**: Clarifications require same catalog IDs and PreferenceProfile-like
dedupe; one catalog module prevents drift.

**Alternatives considered**:
- Separate recipe dietary catalog — rejected by clarification.
- Semantic validation of ingredients against restrictions on save — out of
  scope; planning/AI consumers own that.

## 6. Free-text ingredient and cuisine tags

**Decision**: Ingredient `name` is free-text after trim; blanks rejected; max
length 80 characters (FR-014). Cuisine/style tags: drop blanks; collapse
case-insensitive duplicates (first-seen casing/order); reject any tag >40 chars
or >20 tags after normalization (`RECIPE_LIMIT`) (FR-017).

**Rationale**: Clarification: no shared ingredient catalog in v1. Cuisine tag
collapse matches preference-label handling and is required by FR-017.

**Alternatives considered**:
- Shared ingredient catalog — rejected by clarification.
- No cuisine duplicate collapse — rejected; weaker UX and inconsistent with likes.

## 7. Timing metadata

**Decision**: Optional `prepTimeMinutes` and `cookTimeMinutes` as non-negative
integers (minutes). Optional `servings` as positive integer. Omit or null means
unset; reject negative times and non-integer/non-positive servings.

**Rationale**: Spec requires non-negative durations and positive whole servings;
minutes are unambiguous for consumers and tests.

**Alternatives considered**:
- ISO-8601 duration strings — heavier parsing for little gain in v1.
- Separate hours/minutes fields — redundant.

## 8. Instruction steps

**Decision**: Ordered `string[]` after trim; reject blank steps; require ≥1 step;
max 40 steps; max 2000 characters per step (`RECIPE_LIMIT`) per FR-014.

**Rationale**: Spec requires ordered non-blank steps and caps; per-step length
guard prevents abuse.

**Alternatives considered**:
- Structured step objects (timer, tip) — deferred.
- Unlimited step length — storage/abuse risk; rejected.

## 9. Identity, titles, concurrency, delete

**Decision**: UUID identity; titles not unique; last successful full replace
wins; `DELETE /recipes/{id}` permanently removes (client supplies confirmation
UX before calling DELETE). Library cap 500 enforced on create with
`RECIPE_LIBRARY_FULL` (HTTP 409).

**Rationale**: Matches clarifications and FR-006/FR-014/FR-018. Cap conflict
mirrors `MEMBER_LIMIT` (409) rather than field validation (400).

**Alternatives considered**:
- Soft delete — rejected by spec (permanent remove).
- Optimistic locking — out of scope for v1.
- Map library cap to `RECIPE_LIMIT` 400 — rejected; conflates field limits with
  capacity conflicts.

## 10. Error codes

**Decision**: Reuse `VALIDATION_ERROR`, `UNKNOWN_RESTRICTION`, `NOT_FOUND`. Add
`UNKNOWN_UNIT` (400), `RECIPE_LIMIT` (400 — title/ingredient name/step/tag/count
field limits), and `RECIPE_LIBRARY_FULL` (409 — household already has 500
recipes).

**Rationale**: Parallel to `PREFERENCE_LIMIT` (400) vs `MEMBER_LIMIT` (409) for
clear contract tests (SC-003) and capacity handling.

**Alternatives considered**:
- Single `VALIDATION_ERROR` for all — weaker test targeting.
- Single `RECIPE_LIMIT` for both field and library caps — ambiguous HTTP status;
  rejected after analyze remediation.

## 11. Testing strategy

**Decision**: Vitest unit tests for normalize/limits/unit catalog; integration
for CRUD persistence, reject-leaves-prior-unchanged, library-cap-at-500, and
cross-household isolation (two `householdId` values via `RecipeService`
constructor override even though HTTP v1 uses `DEFAULT_HOUSEHOLD_ID`); contract
tests against `contracts/recipes.openapi.yaml`.

**Rationale**: High-regression surface (limits, catalogs, order, source
enforcement, FR-012/SC-006) relative to quickstart-only smoke.

**Alternatives considered**:
- Quickstart-only — insufficient for SC-003/SC-005/SC-007/SC-006.
- Defer SC-006 because HTTP is single-household — rejected; service-layer
  isolation is still testable and required by FR-012.
