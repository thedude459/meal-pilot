# Data Model: Update Pantry

**Feature**: `010-update-pantry` | **Date**: 2026-07-12

## Overview

This feature adds a **workflow** (`UpdatePantry` / `PantryManager`), not a new
durable entity. It reads checked GroceryItems and PantryItems; it writes pantry
create/increase, optional expired deletes, and deletes applied GroceryItems.

```text
Checked GroceryItems ──┐
PantryItems ───────────┼──► PantryManager ──► PantryItem writes
Ingredient catalog ────┤         │            GroceryItem deletes
removeExpired flag ────┘         └── ApplyReport / PreviewReport (response)
```

## Entities (owned vs reused)

### PantryManager (workflow service — not persisted)

Orchestrates Preview or Confirm: optional expired cleanup → cap check → apply
purchases → (confirm only) delete applied groceries → report.

| Concern | Behavior |
|---------|----------|
| Input | Optional `removeExpired` (default false) |
| Reads | Checked GroceryItems; all PantryItems; Ingredient default units / names |
| Writes (confirm) | Delete expired PantryItems (if flagged); create/increase PantryItems; delete applied GroceryItems |
| Never writes | Unchecked GroceryItems; Ingredient catalog; WeeklyPlan; Recipes |
| Preview | Same projection; **zero** durable writes |

### GroceryItem (dependency — input / delete)

| Field | Role |
|-------|------|
| checked | Only `true` lines are applied |
| ingredientId | Pantry join key |
| quantity | Added to pantry quantity |
| unitId | Must equal Ingredient `defaultUnitId` |

After successful confirm, applied rows are permanently deleted.

### PantryItem (dependency — write target)

Unchanged schema from `005`. Manager rules:

| Prior pantry row (after optional cleanup) | Action |
|-------------------------------------------|--------|
| none | Create with grocery quantity, default unit, expiration `null` |
| exists | Increase quantity by grocery qty (`roundQuantity`); keep unit + expiration |

Expired cleanup (when `removeExpired`):

| expirationDate | Action |
|----------------|--------|
| `null` | Keep |
| ≥ today UTC | Keep |
| &lt; today UTC | Delete before apply |

### Ingredient (dependency — read)

| Field | Role |
|-------|------|
| id | Join key |
| displayName | Report / preview labels |
| defaultUnitId | Required unit for apply validation |

### ApplyReport (response DTO — not persisted)

| Field | Type | Notes |
|-------|------|-------|
| removeExpired | boolean | Echo of request flag |
| applied | AppliedEntry[] | One per checked grocery applied |
| expiredRemoved | ExpiredRemovedEntry[] | Empty when flag false or none expired |
| appliedCount | integer | `applied.length` (≥ 1 on successful confirm) |
| expiredRemovedCount | integer | `expiredRemoved.length` |

#### AppliedEntry

| Field | Type | Notes |
|-------|------|-------|
| ingredientId | string | |
| ingredientDisplayName | string | |
| action | `"created"` \| `"increased"` | After cleanup projection |
| currentQuantity | number \| null | Pantry qty after projected cleanup, before purchase apply; null if no row |
| groceryQuantity | number | Qty taken from grocery line |
| resultingQuantity | number | Pantry qty after apply |
| unitId | string | Ingredient default unit |

#### ExpiredRemovedEntry

| Field | Type | Notes |
|-------|------|-------|
| pantryItemId | string | Removed row id |
| ingredientId | string | |
| ingredientDisplayName | string | |
| quantity | number | Qty that was removed |
| unitId | string | |
| expirationDate | string | YYYY-MM-DD (&lt; today UTC) |

### PreviewReport (response DTO — not persisted)

Same shape as `ApplyReport` fields used for projection (`removeExpired`,
`applied`, `expiredRemoved`, counts). Represents **would-be** outcomes; does not
require ≥1 applied (may be empty when zero checked).

## Validation rules

1. Confirm: `checkedCount >= 1` else `UPDATE_PANTRY_NO_CHECKED` (400) — even if
   `removeExpired` is true.
2. Preview: zero checked → empty `applied` (no error). When `removeExpired` is
   true, preview MAY still list projected `expiredRemoved` (preview-only;
   confirm never runs cleanup-only).
3. Each checked line: Ingredient must exist (unknown → `VALIDATION_ERROR` or
   `NOT_FOUND` per service convention — prefer `VALIDATION_ERROR`);
   `unitId === defaultUnitId` else `UNIT_MISMATCH` (400); whole confirm fails.
4. Resulting quantity after add must be finite, &gt; 0, `roundQuantity` ≤3 dp.
5. Cap: after removing expired (if flagged), `pantryCount + createCount <= 500`
   else `PANTRY_INVENTORY_FULL` (409).
6. `removeExpired` if present must be boolean; invalid type →
   `VALIDATION_ERROR` (400).
7. Confirm is atomic — any failure leaves pantry and grocery unchanged.

## State transitions

```text
[Checked GroceryItem] --confirm apply--> [deleted]
[No PantryItem] --create--> [PantryItem qty=grocery, exp=null]
[PantryItem] --increase--> [PantryItem qty'=round(qty+grocery), exp unchanged]
[PantryItem expired] --removeExpired--> [deleted] --then may create--> [fresh PantryItem]
[Unchecked GroceryItem] --confirm--> [unchanged]
```

## Ordering (confirm)

1. Load checked groceries + pantry + ingredients.
2. If no checked → reject.
3. If `removeExpired` → delete expired pantry rows (in transaction).
4. Cap check for planned creates.
5. For each checked line (stable order: A–Z by ingredient display name):
   create or increase pantry.
6. Delete applied grocery rows.
7. Commit; return ApplyReport (+ current pantry list).

## Out of scope (data)

- Meal-cook consumption events
- Multi-lot / multiple PantryItems per Ingredient
- Persisted apply history
- Unit conversion tables
