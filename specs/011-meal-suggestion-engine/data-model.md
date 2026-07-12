# Data Model: Meal Suggestion Engine

**Feature**: `011-meal-suggestion-engine` | **Date**: 2026-07-12

## Overview

This feature owns the constitution **MealSuggestionEngine** service (not a new
durable entity). It evaluates preferences, filters/ranks library Recipes, and
proposes alternatives. GenerateWeeklyMeals (`008`) remains the organizer-facing
workflow that persists WeeklyPlan / MealSlot updates using engine outputs.

```text
FamilyMember + PreferenceProfile ──┐
Recipe library ────────────────────┼──► MealSuggestionEngine ──► SuggestionResult
PantryItem (soft) ─────────────────┤         │
Prior WeeklyPlans (rotation) ──────┘         │
Existing week assignments / exclusions ──────┘
                                                    │
                         GenerateWeeklyMeals / reject flow (008)
                                                    ▼
                                          WeeklyPlan / MealSlot
```

## Entities (owned vs reused)

### MealSuggestionEngine (service — not persisted) — OWNED

Constitution / Speckit name **MealSuggestionEngine**. Implementation alias:
domain `src/domain/meal-suggestion.ts` + facade `MealSuggestionService` in
`src/services/meal-suggestion-service.ts`.

| Concern | Behavior |
|---------|----------|
| Exposure | Internal only (no standalone suggest HTTP) |
| Reads | Preferences, recipes, pantry, recent plans, current week slots |
| Computes | Hard-safe pool, soft scores, greedy day picks, single-day alternative |
| Writes | None directly — consumers call WeeklyPlanService assign/replace |
| Never | AI Recipe create; grocery/pantry mutation; new plan CRUD rules |

### SuggestionContext (logical input — not persisted)

| Field | Type | Notes |
|-------|------|-------|
| householdId | string | Isolation boundary |
| weekStartDate | Monday ISO date | Target week |
| mode | `fill-empty` \| `regenerate-non-approved` | Used by week-fill consumer |
| existingSlots | MealSlot views | Current week assignments |
| excludeRecipeIds | string[] | e.g. rejected recipe on alternative |
| prefs | HouseholdPreferenceAggregate | Union restrictions/dislikes/likes |
| candidates | CandidateRecipe[] | Household library snapshot |
| pantryIngredientNames | string[] | Non-expired pantry display/match names |
| rotationRecipeIds | set/list | Recipes in target week + prior 14 days |

Logical only — no dedicated TypeScript type or table required; represented by
existing parameters / local snapshots in `MealSuggestionService`.

### CandidateRecipe (logical — derived from Recipe)

| Field | Role |
|-------|------|
| id | Identity + tie-break |
| title | Like/dislike match |
| ingredientNames | Like/dislike + pantry match |
| dietaryAttributeIds | Hard dietary filter |
| prepTimeMinutes, cookTimeMinutes | Soft timing |
| cuisineTags | Soft cuisine variety |

### HouseholdPreferenceAggregate (logical)

| Field | Role |
|-------|------|
| hardRestrictionIds | Union of member dietary restriction IDs |
| dislikes | Union of dislike labels (hard filter) |
| likes | Union of like labels (soft score) |

**Evaluable input rule**: ≥1 FamilyMember required. Empty preference lists on
an existing member are allowed. Zero members → `GENERATION_NO_PREFERENCES`.

### SuggestionResult (logical output — not persisted)

| Variant | Fields | Notes |
|---------|--------|-------|
| Week fill | `assignments[{ day, recipeId }]`, `unfilledDays[{ day, reason }]` | Reason: `NO_SAFE_CANDIDATES` |
| Alternative | `recipeId` or empty + `reason` | Reason: `NO_SAFE_ALTERNATIVE` |

Consumers map these into WeeklyPlan writes + HTTP reports (`008`). Mapped in
code by existing `GenerationReport` / `AlternativeOutcome` — no separate
persisted entity or required new DTO type.

### Recipe / PreferenceProfile / FamilyMember / PantryItem / WeeklyPlan

Dependencies unchanged from `003`–`008`. Engine does not alter their schemas.

## Validation & ranking rules (locked to 008)

1. Hard dietary: every `hardRestrictionIds` entry must appear in
   `dietaryAttributeIds`.
2. Hard dislike: phrase/token match on title or ingredient names; empty/whitespace
   dislike ignored.
3. Soft scores (higher better): likes +2 each; pantry ratio +0..1; timing
   `max(0, 120 - prepPlusCookTotal) / 120` where
   `prepPlusCookTotal = (prepTimeMinutes ?? 0) + (cookTimeMinutes ?? 0)` when
   either timing field is present (missing both → 0 timing bonus); cuisine +0.5
   if first tag unused this week; rotation −5 when recipe in window.
4. Tie-break: score desc, then `recipeId` ascending.
5. Soft-relax: if rotation exclusions empty the day pool, retry without rotation
   exclusions; never relax hard filters.
6. Rotation window: recipes on plans with `weekStartDate` in
   `[targetWeekStart - 14 days, targetWeekStart]` including in-week picks so far.
7. Deterministic for identical snapshots.

## State transitions

Engine itself is stateless. Slot transitions remain owned by WeeklyPlan /
GenerateWeeklyMeals:

```text
(empty) --generate via engine pick--> pending
pending|approved --reject + engine alt ok--> pending (new Recipe)
pending|approved --reject + no alt--> rejected
```

## Identity & uniqueness

- No durable engine entity ID.
- Household isolation on all reads.
- Same Recipe MAY appear on multiple days after rotation soft-relax when the
  library is thin.

## Volume assumptions

- ≤500 recipes, ≤104 plans, ≤7 days — in-memory filter/rank per request.

## Out of scope (no model)

- AI Recipe creation / RecipeHybridEngine
- Standalone suggest HTTP resource
- Generation run history table
- Budget / nutrition fields
- GroceryItem / pantry quantity updates
- Intentional score weight changes vs `008`
