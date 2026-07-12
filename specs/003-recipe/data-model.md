# Data Model: Recipes

**Feature**: `003-recipe` | **Date**: 2026-07-12

## Entities

### Recipe

Household-scoped meal definition. Identity is independent of title.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| householdId | string (UUID) | FK → Household; scopes library |
| title | string | Trimmed; 1–120 chars; **not** unique in household |
| ingredients | IngredientLine[] | Ordered; 1–60 after validation |
| instructionSteps | string[] | Ordered; 1–40; each non-empty after trim; ≤2000 chars |
| servings | number \| null | Optional; positive integer when set |
| prepTimeMinutes | number \| null | Optional; integer ≥ 0 when set |
| cookTimeMinutes | number \| null | Optional; integer ≥ 0 when set |
| cuisineTags | string[] | Free-text; ≤20 after normalize; each ≤40 chars |
| dietaryAttributeIds | string[] | PreferenceProfile dietary catalog IDs; deduped |
| source | `"curated"` \| `"ai"` | Writes from this feature always `curated` |
| createdAt | datetime | Set on create |
| updatedAt | datetime | Bumped on successful replace |

**Relationships**:
- Belongs to one Household
- References zero or more DietaryRestriction catalog entries via
  `dietaryAttributeIds` (same IDs as PreferenceProfile)
- Each ingredient line references one Unit catalog entry by `unitId`

**Validation (on create / replace)**:
1. Trim `title`; reject if empty or length > 120
2. Normalize ingredients: trim names; reject blank names; reject name length >
   80; quantity must be finite and > 0; round quantity to ≤3 decimal places;
   `unitId` must be in unit catalog
3. Require 1–60 ingredients; preserve order; do not merge duplicate names
4. Trim instruction steps; drop is not allowed for blanks—any blank step
   rejects; require 1–40 steps; each ≤2000 chars; preserve order
5. Cuisine tags: trim; drop blanks; collapse case-insensitive duplicates
   (first-seen casing/order); reject if any remaining tag > 40 chars or count >
   20
6. Dietary attribute IDs: every id must be in dietary restriction catalog;
   collapse duplicate IDs first-seen order
7. Optional `servings`: if present, positive integer
8. Optional times: if present, integer ≥ 0 (minutes)
9. Force `source = "curated"` on create/replace from this feature
10. On create only: reject if household already has 500 recipes with
    `RECIPE_LIBRARY_FULL` (do not insert)
11. Failed validation (`RECIPE_LIMIT` / catalog errors) leaves prior row
    unchanged (replace) or inserts nothing (create); last successful replace wins

### IngredientLine (embedded)

| Field | Type | Notes |
|-------|------|-------|
| name | string | Free-text; trimmed; 1–80 chars; no shared catalog |
| quantity | number | Finite; > 0; ≤3 decimal places after normalize |
| unitId | string | Must exist in Unit catalog |

### Unit (catalog)

| Field | Type | Notes |
|-------|------|-------|
| id | string | Stable slug, e.g. `cup` |
| label | string | Human-readable, e.g. "cup" |
| kind | string | `volume` \| `mass` \| `count` |

**Initial catalog**: see [research.md](./research.md) §3.

### DietaryAttributeTag (catalog alias)

Not a separate table. Uses DietaryRestriction catalog from
`001`/`002` (`vegetarian`, `gluten_free`, …).

### Household (dependency)

| Field | Role for this feature |
|-------|------------------------|
| id | Scopes recipe library (`DEFAULT_HOUSEHOLD_ID` in v1) |

## State Transitions

```text
[List Recipes]
  → return summaries for household (id, title, source, servings, updatedAt)

[Get Recipe]
  → must exist in household
  → return full shared schema including source

[Create Recipe]
  → normalize + validate
  → enforce library cap 500 → RECIPE_LIBRARY_FULL if at cap
  → insert with source=curated
  → on failure: no row

[Replace Recipe]
  → must exist in household
  → normalize + validate (full replace of mutable fields)
  → source remains curated
  → on failure: prior row unchanged
  → concurrent replaces: last success wins

[Delete Recipe]
  → must exist in household
  → permanent delete; no restore
  → does not cascade to members/preferences/pantry

[List Units]
  → return predefined Unit catalog

[List Dietary Restrictions]
  → existing GET /dietary-restrictions (reuse; not redefined)
```

## Indexes / Constraints

- PK (`id`) on recipes
- Index (`household_id`) for library list and count-for-cap
- No UNIQUE on title
- Application-enforced unit/dietary catalogs, limits, and source rules
- FK `household_id` → households (optional cascade on household delete; v1
  single default household is long-lived)

## Constants

| Name | Value |
|------|-------|
| MAX_TITLE_LENGTH | 120 |
| MAX_INGREDIENT_NAME_LENGTH | 80 |
| MAX_INGREDIENTS | 60 |
| MAX_INSTRUCTION_STEPS | 40 |
| MAX_STEP_LENGTH | 2000 |
| MAX_CUISINE_TAG_LENGTH | 40 |
| MAX_CUISINE_TAGS | 20 |
| MAX_RECIPES_PER_HOUSEHOLD | 500 |
| QUANTITY_DECIMAL_PLACES | 3 |

## Error codes (application)

| Code | HTTP | When |
|------|------|------|
| VALIDATION_ERROR | 400 | Malformed / invalid numeric metadata |
| UNKNOWN_UNIT | 400 | unitId not in catalog |
| UNKNOWN_RESTRICTION | 400 | dietaryAttributeId not in dietary catalog |
| RECIPE_LIMIT | 400 | Title/name/step/tag/count field limits |
| RECIPE_LIBRARY_FULL | 409 | Create when household already has 500 recipes |
| NOT_FOUND | 404 | Missing recipe id |

## Out of scope

AI generation, recipe suggestions, ingredient substitution, seasonal/budget
filters, WeeklyPlan linking, grocery quantity merge, pantry subtraction, shared
ingredient identity catalog, soft delete, optimistic locking, multi-household
auth, global seed recipe import.
