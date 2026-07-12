# Research: Update Pantry

**Feature**: `010-update-pantry` | **Date**: 2026-07-12

## 1. Persistence: workflow over GroceryItem + PantryItem

**Decision**: No new confirmation-run or apply-history table. `PantryManager`
reads checked `grocery_items` and `pantry_items`, writes pantry create/increase
+ optional expired deletes + grocery deletes for applied lines. `ApplyReport`
and preview payloads are response-only (not persisted).

**Rationale**: Spec owns a workflow, not an audit log. `005` / `006` already
provide durable stock and shopping lines. Avoids dual sources of truth.

**Alternatives considered**:
- `pantry_apply_runs` history table — useful for audit later; deferred.
- Soft-delete / “applied” flag on GroceryItem — rejected by clarification
  (permanent remove after apply).

## 2. API shape

**Decision**:
- `POST /pantry-items/update` — confirm (mutates)
- `POST /pantry-items/update/preview` — read-only projection
- Body (both): `{ "removeExpired"?: boolean }` — default `false` when omitted
- Confirm `200`:
  `{ "items": [...], "maxPantryItems": 500, "report": ApplyReport }`
  where each `applied[]` entry includes `currentQuantity` (nullable),
  `groceryQuantity`, `resultingQuantity`, and `action`
- Preview `200`: `{ "preview": ApplyReport }` (same line/removal shape as
  report projection including `currentQuantity`; no mutations)
- Errors on confirm:
  - `400` `UPDATE_PANTRY_NO_CHECKED` — zero checked lines (including
    cleanup-only)
  - `400` `VALIDATION_ERROR` / `UNIT_MISMATCH` — bad flag type, unknown
    Ingredient, or unit ≠ default
  - `409` `PANTRY_INVENTORY_FULL` — creates after cleanup would exceed 500
- Preview with zero checked: `200` empty `applied` (may still list projected
  `expiredRemoved` when `removeExpired` true), not an error

**Rationale**: Nested under `/pantry-items` because PantryItem is the primary
write target (mirrors `POST /grocery-items/build`). Separate preview path keeps
confirm free of accidental dry-run flags. Dedicated `UPDATE_PANTRY_NO_CHECKED`
mirrors `BUILD_NO_APPROVED_MEALS` clarity.

**Alternatives considered**:
- Single `POST` with `dryRun: true` — easy to misuse; separate preview is
  clearer for contract tests.
- `POST /grocery-items/confirm-pantry` — grocery is the input signal but pantry
  is the constitution output; pantry path preferred.

## 3. Cleanup-then-apply ordering

**Decision**: When `removeExpired` is true:
1. Identify PantryItems with `expirationDate < todayUTC` (null / today /
   future kept).
2. Project/delete those rows.
3. Evaluate cap against remaining count + planned **creates**.
4. Apply each checked grocery: create if no remaining pantry row for
   Ingredient; else increase quantity (preserve expiration).
5. Delete applied GroceryItems.
6. Build ApplyReport.

When `removeExpired` is false: skip steps 1–2; increases may add to expired
stock (spec US3.3).

**Rationale**: Clarification Option B — restock after removing expired stock
creates fresh rows instead of deleting the purchase.

**Alternatives considered**:
- Apply then cleanup — rejected (loses purchase on expired Ingredient).
- Skip cleanup for restocked Ingredients — more complex; B is sufficient.

## 4. Cap evaluation

**Decision**: Cap check uses pantry size **after** projected/executed expired
removals, then counts how many checked lines would **create** (no remaining
row for that Ingredient). Increases do not consume new cap slots. If
`remaining + createCount > 500` → fail entire confirm with
`PANTRY_INVENTORY_FULL` and no writes.

**Rationale**: Clarification — cleanup frees slots for this confirmation.

**Alternatives considered**:
- Cap before cleanup — rejected.
- Partial skip of creates — rejected (atomic fail required).

## 5. Quantity, units, expiration on write

**Decision**:
- Reuse `roundQuantity` (≤3 decimal places) for sum = prior + grocery qty.
- Report `currentQuantity` = pantry qty after cleanup projection, before add
  (null if no remaining row).
- Grocery `unitId` MUST equal Ingredient `defaultUnitId` at apply time;
  mismatch → whole confirm fails (`UNIT_MISMATCH`).
- Unknown Ingredient on a checked line → whole confirm fails
  (`VALIDATION_ERROR`).
- Create: expiration `null`. Increase: keep existing `expirationDate`.

**Rationale**: Aligns with PantryItem FR rules and UpdatePantry FR-002 / FR-009.

**Alternatives considered**:
- Soft-skip bad lines — rejected by atomic apply.

## 6. Shared UTC today helper

**Decision**: Reuse `utcTodayDate` from `grocery-list-builder.ts` (or extract to
a tiny shared `src/domain/dates.ts` during implement if import coupling feels
wrong). Expiration cleanup predicate: `expirationDate !== null &&
expirationDate < todayUtc`.

**Rationale**: Same UTC calendar rule as BuildGroceryList / clarifications.

**Alternatives considered**:
- Local timezone “today” — rejected for consistency with `009`.

## 7. Transactionality

**Decision**: Confirm runs in a single better-sqlite3 / Drizzle transaction:
expired deletes → pantry creates/replaces → grocery deletes. Any thrown domain
error rolls back all writes. Preview uses the same pure projection functions
with no DB writes.

**Rationale**: Spec atomicity; prevents half-applied pantry with leftover
checked groceries (double-count risk).

**Alternatives considered**:
- Best-effort multi-call without transaction — rejected by FR-001 / FR-006.

## 8. Out of scope

**Decision**: Do not implement meal-cook decrement, unit conversion, multi-lot
stock, BuildGroceryList changes, or export.

**Rationale**: Spec FR-010 / Assumptions; keeps `010` focused on shopping
confirmation.

**Alternatives considered**:
- Bundle cook decrement — expands scope beyond constitution UpdatePantry input
  (grocery list + confirmation).
