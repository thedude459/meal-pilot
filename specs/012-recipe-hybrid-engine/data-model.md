# Data Model: Recipe Hybrid Engine

**Feature**: `012-recipe-hybrid-engine` | **Date**: 2026-07-12

## Overview

This feature owns the constitution **RecipeHybridEngine** service. It generates
AI recipe candidates, validates them against the shared Recipe schema and
household preferences, persists accepted `source=ai` rows, supports hybrid fill
and substitution, and applies optional seasonal/budget soft guidance. It does
not own curated CRUD, meal ranking, or weekly-plan orchestration.

```text
FamilyMember + PreferenceProfile ──┐
RecipeAiGenerator (port) ──────────┼──► RecipeHybridEngine ──► HybridGenerationResult
Existing Recipe (substitute) ──────┤         │
Optional seasonal/budget soft ─────┘         │
                                             ▼
                                    recipes (source=ai)
                                             │
                    MealSuggestionEngine / grocery (later consumers)
```

## Entities (owned vs reused)

### RecipeHybridEngine (service — not persisted) — OWNED

Constitution / Speckit name **RecipeHybridEngine**. Implementation:
`src/domain/recipe-hybrid.ts` + facade `RecipeHybridService` in
`src/services/recipe-hybrid-service.ts`.

| Concern | Behavior |
|---------|----------|
| Exposure | Internal only (no new HTTP) |
| Reads | Preferences, recipes (for substitute / capacity) |
| Computes | Generate via port, schema+preference gate, retry ≤3/slot, substitute, soft tags |
| Writes | Accepted AI recipes via RecipeService (`source=ai`) |
| Never | Curated create/edit ownership change; grocery/pantry/plan writes; GenerateWeeklyMeals auto-wire |

### RecipeAiGenerator (port — not persisted) — OWNED interface

| Method | Input | Output |
|--------|-------|--------|
| `generate` | Hybrid constraints + prefs summary + attempt index | Raw candidate fields (title, ingredients, steps, optional metadata/tags) |

Non-deterministic in production adapters; faked in tests.

### HybridGenerationRequest (logical input — not persisted)

| Field | Type | Notes |
|-------|------|-------|
| householdId | string | Isolation (usually from service ctor) |
| count | positive int | Default 1 for single generate; N for fill |
| seasonalGuidance | string? | Optional soft |
| budgetGuidance | string? | Optional soft |
| excludeRecipeIds | string[]? | Optional avoid duplicates when filling |

### HybridGenerationResult (logical output — not persisted)

| Field | Type | Notes |
|-------|------|-------|
| accepted | Recipe[] | Newly persisted AI recipes |
| requestedCount | number | Echo |
| acceptedCount | number | `accepted.length` |
| unmetCount | number | `requestedCount - acceptedCount` |
| failures | `{ reason }[]` | High-level reasons per unmet slot |

Example reasons: `HYBRID_GENERATION_FAILED`, `RECIPE_LIBRARY_FULL`,
`NO_SAFE_CANDIDATE_AFTER_RETRIES`.

### SubstitutionRequest (logical input — not persisted)

| Field | Type | Notes |
|-------|------|-------|
| recipeId | string | Target library recipe |
| ingredientName | string | Exactly one existing line to replace (match after trim, case-insensitive) |
| replacement | `{ name, quantity, unitId }` | **Required** structured line; free-text / generator-invented replacement without structure is out of scope for v1 |
| mode | `distinct` \| `replace-in-place` | Default `distinct` |

### SubstitutionResult (logical output — not persisted)

| Variant | Fields |
|---------|--------|
| Success distinct | `recipe: Recipe` (new AI row), `originalUnchanged: true` |
| Success replace | `recipe: Recipe` (updated AI row) |
| Failure | error code (`HYBRID_REPLACE_CURATED_FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, preference/schema failure) |

### Recipe (persisted — REUSED from 003, AI writes owned here)

| Field | AI path rule |
|-------|----------------|
| source | Must be `ai` on create via hybrid engine |
| title, ingredients, instructionSteps, … | Same shared schema / limits as curated |
| cuisineTags | May include normalized seasonal/budget guidance tags |
| dietaryAttributeIds | Must satisfy household hard restrictions on accept |

Curated `normalizeRecipeInput` remains force-`curated`. Hybrid uses a separate
normalize that forces `ai`.

### PreferenceProfile / FamilyMember — REUSED

Loaded into the same hard-restriction + dislike aggregate semantics as
MealSuggestionEngine (`011`) for acceptance checks.

## Validation rules

1. **Schema**: Shared Recipe structural validation; force `source=ai` on hybrid
   accept path.
2. **Dietary hard**: Every household `hardRestrictionId` ∈
   `dietaryAttributeIds`.
3. **Dislike hard**: Case-insensitive exact / token / contiguous phrase on
   title + ingredient names (same as `011`).
4. **Retry**: ≤3 attempts per requested slot; no persist on failure.
5. **Capacity**: Refuse insert at 500 recipes (`RECIPE_LIBRARY_FULL`).
6. **Substitution**: Unknown ingredient → reject; curated + replace-in-place →
   `HYBRID_REPLACE_CURATED_FORBIDDEN`; result must pass (1)–(3) before write.
7. **Soft guidance**: Optional; merge into cuisine tags after normalize rules;
   never bypass (2)–(3).
8. **Household isolation**: All reads/writes scoped by householdId.
9. **Determinism**: Validation outcomes identical for identical candidate +
   prefs; generation itself may vary.

## State transitions

```text
[Request] → generate candidate → schema+prefs gate
    ├─ pass → persist source=ai → accepted
    └─ fail → attempt < 3 ? retry : unmet / error

[Substitute distinct] → apply structured replacement → gate → insert AI row
[Substitute replace AI] → apply structured replacement → gate → update same row (source stays ai)
[Substitute replace curated] → reject (no write)
```

## Relationships

- RecipeHybridEngine **creates/updates** Recipe (`ai`) and **reads**
  PreferenceProfile / FamilyMember / Recipe.
- MealSuggestionEngine **reads** AI Recipes after acceptance (no change required
  in `011` for source filtering—already library-wide).
- GenerateWeeklyMeals **may** call hybrid fill later; not wired in this feature.

## Out of scope (data)

- New tables or columns for season/budget
- Ephemeral AI meals without library identity
- WeeklyPlan / GroceryItem / PantryItem mutations
- Changing curated Recipe HTTP contracts
