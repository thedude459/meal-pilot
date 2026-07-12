# Data Model: Build Grocery List

**Feature**: `009-build-grocery-list` | **Date**: 2026-07-12

## Overview

This feature adds a **workflow** (`BuildGroceryList` / `GroceryListBuilder`),
not a new durable entity. It reads approved WeeklyPlan meals, Recipes,
Ingredients, and PantryItems; it writes GroceryItems (`006`).

```text
WeeklyPlan (approved slots) ──┐
Recipe ingredient lines ──────┤
Ingredient catalog (+aliases) ┼──► GroceryListBuilder ──► GroceryItem sync
PantryItem (available qty) ───┤         │
Existing GroceryItems ────────┘         └── BuildReport (response)
```

## Entities (owned vs reused)

### GroceryListBuilder (workflow service — not persisted)

Orchestrates Extract → Match → Merge → Subtract pantry → Sync grocery → Report.

| Concern | Behavior |
|---------|----------|
| Input | Monday `weekStartDate` → household WeeklyPlan |
| Reads | Approved MealSlots + Recipes; Ingredient catalog; PantryItems; GroceryItems |
| Writes | Create / quantity-replace / delete **unchecked** GroceryItems only |
| Never writes | Checked GroceryItems; PantryItems; WeeklyPlan/slots; Recipes; Ingredients |

### WeeklyPlan / MealSlot (dependency — read)

| Field | Role |
|-------|------|
| weekStartDate | Monday UTC identity for the build |
| slots[].status | Only `approved` contributes |
| slots[].recipeId | Recipe to extract |

### Recipe (dependency — read)

| Field | Role |
|-------|------|
| ingredients[].name | Match to catalog via normalized label key |
| ingredients[].quantity | Sum into merged need when unit matches |
| ingredients[].unitId | Must equal Ingredient `defaultUnitId` to contribute |

### Ingredient (dependency — match index)

| Field | Role |
|-------|------|
| id | Grocery / pantry identity |
| displayName | Label key for match + list display |
| aliases[] | Additional label keys |
| defaultUnitId | Required unit for merge contribution and grocery write |
| shoppingCategoryId | List grouping via existing GroceryItem list rules |

**Match rule**: `labelKey(normalizeIngredientLabel(recipeName))` equals
display-name key or any alias key.

### PantryItem (dependency — subtract)

| Field | Role |
|-------|------|
| ingredientId | Join to merged Ingredient |
| quantity | Subtract when available |
| expirationDate | null → available; date ≥ today UTC → available; date &lt; today UTC → ignore qty |

### GroceryItem (dependency — write target)

Unchanged schema from `006`. Builder rules:

| Existing row | netNeed | Action |
|--------------|---------|--------|
| none | &gt; 0 | Create unchecked |
| unchecked | &gt; 0 | Replace quantity/unit (default unit) |
| unchecked | 0 (in merged set) | Delete |
| checked | any | No write; report shortfall if `netNeed > quantity` |
| any | n/a (ingredient **not** in merged set) | No write |

### BuildReport (response DTO — not persisted)

| Field | Type | Notes |
|-------|------|-------|
| weekStartDate | string (YYYY-MM-DD) | Echo |
| approvedSlotCount | integer | ≥ 1 on success |
| created | string[] | ingredientIds created |
| updated | string[] | ingredientIds quantity-replaced |
| removed | string[] | ingredientIds deleted (unchecked, net need 0) |
| pantryCovered | PantryCoveredEntry[] | In merged set, net need 0 after available pantry |
| unmatched | UnmatchedEntry[] | Recipe lines with no catalog match |
| unitConflicts | UnitConflictEntry[] | Name matched; unit ≠ default |
| checkedSkips | CheckedSkipEntry[] | Checked line blocked write; include remainingShortfall |

#### UnmatchedEntry

| Field | Type |
|-------|------|
| recipeId | string |
| day | Weekday |
| ingredientName | string |
| quantity | number |
| unitId | string |

#### UnitConflictEntry

| Field | Type |
|-------|------|
| recipeId | string |
| day | Weekday |
| ingredientId | string |
| ingredientName | string |
| quantity | number |
| unitId | string |
| expectedUnitId | string |

#### PantryCoveredEntry

| Field | Type |
|-------|------|
| ingredientId | string |
| mergedNeed | number |
| availablePantry | number |

#### CheckedSkipEntry

| Field | Type |
|-------|------|
| ingredientId | string |
| checkedQuantity | number |
| netNeed | number |
| remainingShortfall | number |

**Deterministic ordering** (for tests):
- `created` / `updated` / `removed` / `pantryCovered` / `checkedSkips`: sort by
  linked Ingredient display name key ascending
- `unmatched` / `unitConflicts`: sort by day (Mon→Sun), then recipe ingredient
  line index ascending

## Derived quantities

```text
mergedNeed[ingredientId] = sum(roundQuantity(line.qty) for matching unit lines)
availablePantry[ingredientId] = pantry.qty if available else 0
netNeed[ingredientId] = max(0, roundQuantity(mergedNeed - availablePantry))
```

Name match with zero successful unit lines ⇒ `mergedNeed = 0`, still in merged
set.

## Validation / errors

| Condition | Code | HTTP |
|-----------|------|------|
| Missing / non-Monday weekStartDate | `VALIDATION_ERROR` | 400 |
| No WeeklyPlan for week | `NOT_FOUND` | 404 |
| Zero approved slots | `BUILD_NO_APPROVED_MEALS` | 400 |
| Post-sync grocery count &gt; 500 | `GROCERY_LIST_FULL` | 409 |

Failed builds MUST NOT change any GroceryItem rows.

## State notes

- No new entity lifecycle. GroceryItem `checked` still only changes via `006`
  toggle.
- Build does not transition WeeklyPlan slot statuses.

## Out of scope (no model changes)

- Export payloads / external service credentials
- UpdatePantry mutations
- Unit conversion tables
- Servings multipliers
- Multi-week merge documents
- Persisted BuildReport history
