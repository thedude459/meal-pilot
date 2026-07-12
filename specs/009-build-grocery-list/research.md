# Research: Build Grocery List

**Feature**: `009-build-grocery-list` | **Date**: 2026-07-12

## 1. Persistence: workflow over existing GroceryItem

**Decision**: No new grocery-list or build-run table. `GroceryListBuilder`
reads WeeklyPlan / Recipes / Ingredients / PantryItems and writes
`grocery_items` via GroceryItemService primitives (create, quantity replace,
delete). `BuildReport` is response-only (not persisted).

**Rationale**: Spec owns a workflow, not a parallel list document. `006`
already provides the durable 1:1 Ingredient shopping lines. Avoids dual sources
of truth.

**Alternatives considered**:
- `grocery_builds` history table — useful for audit later; deferred.
- Named multi-list documents — rejected by Assumptions (one list per household).

## 2. Build API shape

**Decision**:
- `POST /grocery-items/build` with body `{ "weekStartDate": "YYYY-MM-DD" }`
- Resolve WeeklyPlan by household + Monday `weekStartDate` (same UTC Monday
  rule as `007` / `008`)
- Response `200`:
  `{ "groups": [...], "maxGroceryItems": 500, "report": BuildReport }`
  where `groups` matches `GET /grocery-items` shape after the sync
- Errors:
  - `400` `VALIDATION_ERROR` — missing / non-Monday weekStartDate
  - `400` `BUILD_NO_APPROVED_MEALS` — plan exists but zero approved slots
  - `404` `NOT_FOUND` — no WeeklyPlan for that week
  - `409` `GROCERY_LIST_FULL` — applying unchecked sync would exceed 500

**Rationale**: Nested under `/grocery-items` because GroceryItem is the write
target (mirrors `POST /weekly-plans/generate` living next to its write target).
Returning grouped list + report satisfies FR-007 / FR-008 without a second GET.

**Alternatives considered**:
- `POST /weekly-plans/{id}/build-grocery` — couples path to plan id; week-start
  is the organizer-facing identity already used by generate.
- Always `201` — build is idempotent sync, not resource create; use `200`.

## 3. Ingredient name matching

**Decision**: Build a household catalog index keyed by
`labelKey(normalizeIngredientLabel(...))` for each Ingredient `displayName` and
each alias. For each Recipe ingredient `name`, compute the same key and look up
exactly one Ingredient. No fuzzy / substring / token match beyond exact label
key equality. Unmatched names → report `unmatched[]`; omit from merge
quantities (and do not enter merged set).

**Rationale**: Clarification + Ingredients feature uniqueness already guarantees
at most one catalog claim per normalized label. Reuses
`normalizeIngredientLabel` / `labelKey` from `004`.

**Alternatives considered**:
- Token/phrase matcher from GenerateWeeklyMeals dislikes — broader false
  positives for shopping identity; rejected by spec (exact name/alias only).
- Auto-create catalog Ingredients — rejected by Assumptions.

## 4. Merge, units, and merged-set membership

**Decision**:
- On name match → Ingredient enters **merged set** immediately.
- Sum quantity only when Recipe line `unitId` equals Ingredient
  `defaultUnitId`; else append `unitConflicts[]` and contribute 0 to sum.
- All lines unit-conflicted → still in merged set with successful merge
  quantity 0 (clarification Option A).
- Round intermediate and final quantities with shared `roundQuantity` (≤3
  decimal places).
- No servings scaling (FR-014).

**Rationale**: Matches clarifications; keeps manual-add detection based on
“never name-matched from approved meals this run.”

**Alternatives considered**:
- Exclude unit-only failures from merged set — rejected by clarification A.
- Hard-fail build on any unit conflict — rejected by FR-007 soft-complete.

## 5. Pantry availability (expiration)

**Decision**:
- Available pantry qty = PantryItem.quantity when `expirationDate` is null/absent
  OR `expirationDate >= todayUTC` (date-only `YYYY-MM-DD` compare in UTC).
- Expired (`expirationDate < todayUTC`) → subtract 0 (do not use quantity).
- Net need = `max(0, roundQuantity(mergedNeed - availablePantry))`.
- Fully covered (net need 0) → not written as unchecked buy; if in merged set,
  remove existing unchecked line.

**Rationale**: Clarifications B (ignore expired) + A (UTC today aligned with
Monday week-start).

**Alternatives considered**:
- Subtract expired stock — rejected.
- Report expired pantry rows — optional UX; not required by chosen Option B;
  may appear later without blocking v1.

## 6. Grocery sync semantics (atomic)

**Decision** — compute plan in memory, then apply in one SQLite transaction:

For each Ingredient in merged set:
1. Compute `netNeed`.
2. If existing GroceryItem `checked === true`:
   - Leave row unchanged.
   - Report `checkedSkips[]` with `remainingShortfall = max(0, netNeed - checkedQty)`.
3. Else if `netNeed > 0`:
   - Create or replace quantity/unit (unit = defaultUnitId); keep unchecked.
4. Else (`netNeed === 0`):
   - Delete unchecked row if present; do not create.

For GroceryItems whose `ingredientId` is **not** in merged set:
- Leave unchanged (manual adds / non-plan leftovers) — clarification B.

**Cap check**: Simulate post-sync unchecked+checked count; if &gt; 500, abort
before writes → `GROCERY_LIST_FULL` (409). Never leave a half-applied unchecked
rebuild.

**Rationale**: Encodes FR-006 / FR-012 and clarifications on checked shortfall
and out-of-set leave.

**Alternatives considered**:
- Remove all unchecked not in need set — rejected by clarification B.
- Overwrite checked quantity — rejected by clarification B on Q1.

## 7. Error codes and determinism

**Decision**:
- New `BUILD_NO_APPROVED_MEALS` (400) when plan exists but approved count is 0.
- Processing order for report arrays: stable sort by ingredient display name
  (case-insensitive) or by recipe day then line index for unmatched/conflicts
  tied to recipe lines — document in data-model for deterministic tests.
- Same inputs → same groups + report (FR-009).

**Rationale**: Distinct from validation vs not-found; mirrors
`GENERATION_NO_PREFERENCES` pattern from `008`.

**Alternatives considered**:
- Reuse `VALIDATION_ERROR` for zero approved — less precise for clients;
  rejected.

## 8. Export / UpdatePantry

**Decision**: Out of delivery scope; constitution capabilities **deferred, not
waived** (same pattern as AI hybrid in `008`).

**Rationale**: Spec FR-010 / FR-011 and Assumptions.

**Alternatives considered**:
- Minimal CSV export in v1 — expands scope beyond clarified delivery; deferred.
