# Data Model: Generate Weekly Meals

**Feature**: `008-generate-weekly-meals` | **Date**: 2026-07-12

## Overview

This feature adds a **workflow** (`GenerateWeeklyMeals` / `MealSuggestionEngine`),
not a new durable entity. It reads household preferences, recipes, pantry, and
recent plans; it writes MealSlots on WeeklyPlan (`007`).

```text
FamilyMember + PreferenceProfile ──┐
Recipe library ────────────────────┼──► MealSuggestionEngine ──► WeeklyPlan / MealSlot
PantryItem (soft) ─────────────────┤         │
Prior WeeklyPlans (rotation) ──────┘         └── reject→alternative on status=rejected
```

## Entities (owned vs reused)

### MealSuggestionEngine (workflow service — not persisted)

Orchestrates Evaluate preferences → Filter candidates → Rank → Assign slots →
Report. Invoked by generate action and by reject status path.

| Concern | Behavior |
|---------|----------|
| Modes | `fill-empty` (default), `regenerate-non-approved` |
| Targets | All eligible days for mode; Monday→Sunday order |
| Writes | Assign/replace slot Recipe with status `pending` |
| Never writes | Approved slots; AI Recipe creates; grocery/pantry mutations |

### WeeklyPlan / MealSlot (dependency — write target)

Unchanged schema from `007`. Generation creates plan if missing for
`weekStartDate`, else reuses. Filled generated slots use status `pending`.

| Mode | Eligible slots |
|------|----------------|
| `fill-empty` | Empty days only |
| `regenerate-non-approved` | Empty, `pending`, or `rejected` |

Approved slots are never eligible.

### Recipe (dependency — candidates)

Existing household library only. Fields used by the engine:

| Field | Role |
|-------|------|
| id | Assignment + rotation identity + tie-break |
| title | Dislike/like matching |
| ingredients[].name | Dislike/like + pantry matching |
| dietaryAttributeIds | Hard dietary filter (must include each required restriction ID) |
| prepTimeMinutes, cookTimeMinutes | Soft timing score (sum; missing → no timing bonus) |
| cuisineTags | Soft within-week cuisine variety |
| source | Ignored for creation; existing `ai` rows may still be selected if already in library |

### PreferenceProfile / FamilyMember (dependency — inputs)

| Input | Role |
|-------|------|
| dietaryRestrictionIds (union across members) | Hard filter |
| dislikes (union) | Hard filter via title/ingredient phrase-token match |
| likes (union; effective likes per member then union) | Soft ranking |

**Evaluable input rule**: At least one FamilyMember must exist. Empty preference
lists on that member are allowed. Zero members → `GENERATION_NO_PREFERENCES`.
Absence of a separately stored PreferenceProfile document is not a distinct
failure mode—members always carry a preference surface (possibly empty).

### PantryItem (dependency — soft input)

Match pantry item names to recipe ingredient names (case-insensitive exact name
or token/phrase rules aligned with dislike matcher where practical; minimum:
case-insensitive equality on normalized names). Boosts score only; never
excludes a recipe.

### GenerationReport (response DTO — not persisted)

| Field | Type | Notes |
|-------|------|-------|
| mode | enum | `fill-empty` \| `regenerate-non-approved` |
| filledDays | Day[] | Days successfully written this run |
| unfilledDays | { day, reason }[] | Eligible days not filled; reason e.g. `NO_SAFE_CANDIDATES` |

### AlternativeOutcome (response DTO — reject path)

| Field | Type | Notes |
|-------|------|-------|
| applied | boolean | true → day now pending with new Recipe |
| reason | string? | When applied=false: `NO_SAFE_ALTERNATIVE` |

## Validation rules

### Generate

1. `weekStartDate` required, ISO Monday (UTC) — else `VALIDATION_ERROR`
2. `mode` optional; if present must be enum — else `VALIDATION_ERROR`
3. No day-subset fields allowed (unknown properties → `VALIDATION_ERROR` if
   project convention rejects extras; at minimum ignore is insufficient—reject
   unknown `days` if sent)
4. ≥1 FamilyMember — else `GENERATION_NO_PREFERENCES`
5. If no plan exists and household at 104 plans — `WEEKLY_PLAN_LIBRARY_FULL`
6. Hard filters never relaxed; rotation soft-relaxed only when needed to fill

### Reject → alternative

1. Plan and day must exist; slot must be filled — else existing `007` errors
2. Requested status must be `rejected` to trigger alternative path
3. Alternative ≠ current recipeId; must pass hard filters
4. Success → pending + new recipeId; failure → durable rejected + prior recipe

## State transitions (slot)

```text
(empty) --generate/assign--> pending
pending --approve--> approved
pending|approved --reject + alt ok--> pending (new Recipe)
pending|approved --reject + no alt--> rejected
rejected --regenerate-non-approved / assign--> pending
approved --(generate modes)--> unchanged
```

## Identity & uniqueness

- Still at most one WeeklyPlan per `(householdId, weekStartDate)` — generate
  reuses, never duplicates (SC-008).
- Same Recipe MAY appear on multiple days if soft rotation is relaxed or
  library is thin (aligned with `007`); engine prefers avoiding repeats.

## Volume assumptions

- ≤500 recipes, ≤104 plans, ≤7 days, small member/pantry counts — in-memory
  filter/rank per request is acceptable.

## Out of scope (no model)

- AI Recipe creation / RecipeHybridEngine persistence
- Generation run history entity
- Budget constraints
- Separate “suggested” slot status
- GroceryItem / pantry quantity updates
