# Implementation Plan: Recipes

**Branch**: `003-recipe` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-recipe/spec.md`

## Summary

Deliver a household-scoped curated recipe library as a first-class Speckit
module on the existing TypeScript + Hono + SQLite stack. Organizers create,
list, view, full-replace, and permanently delete Recipes that share one hybrid
schema (`source: curated | ai`) with measurable Ingredients (free-text name,
positive decimal quantity, catalog unit), ordered instruction steps, optional
metadata, and dietary attribute tags that reuse the PreferenceProfile dietary
restriction catalog. AI generation, meal planning, grocery merge, and pantry
are out of delivery scope; this feature locks the curated path and shared
shape for later `RecipeHybridEngine` consumers.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Hono (HTTP API), Zod (validation), Drizzle ORM +
better-sqlite3 (persistence), Vitest (tests)

**Storage**: SQLite — new `recipes` table scoped by `household_id` (reuse
`DEFAULT_HOUSEHOLD_ID` pattern). Ordered ingredients, steps, cuisine tags, and
dietary tag IDs stored as JSON text columns (same pattern as preference
profiles).

**Testing**: Vitest for unit (normalize/validate recipe + unit catalog),
integration (CRUD + household isolation + limits), and contract (recipes
OpenAPI). Quickstart smoke remains the manual acceptance path.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); API consumed by
a future organizer UI and later meal-planning / grocery modules

**Project Type**: Single-project modular domain service + HTTP API

**Performance Goals**: Organizer can add a simple recipe (≤5 ingredients, ≤5
steps) in under 5 minutes (SC-002). Sub-200ms list/get/replace for ≤500 recipes
is a stretch target; no load harness required in `003` tasks. Quickstart +
Vitest are the acceptance path.

**Constraints**: Deterministic curated paths only; shared schema with `source`;
title ≤120 chars; ingredient name ≤80; step ≤2000 chars; ≤60 ingredients;
≤40 steps; ≤500 recipes/household; cuisine tags ≤40 chars / ≤20 tags with
case-insensitive collapse; dietary tags = PreferenceProfile catalog IDs with
first-seen dedupe; units from predefined catalog; positive decimal quantities;
duplicate titles allowed; last-write-wins full replace; field limits →
`RECIPE_LIMIT` (400); library full → `RECIPE_LIBRARY_FULL` (409); no business
logic outside Speckit domain modules

**Scale/Scope**: 1 household (v1 default), ≤500 recipes; AI generation /
suggestion / substitution / WeeklyPlan linking out of delivery scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: PASS — Recipes store dietary attribute tags
  using the same catalog IDs as PreferenceProfile hard restrictions for later
  consumers; this feature does not override or ignore preferences.
- **Balanced Weekly Planning**: N/A — out of scope for this feature.
- **Automatic Grocery Generation**: N/A for delivery — structured Ingredients
  are exposed so grocery can expand later; no grocery list built here.
- **Pantry-Aware Inventory**: N/A — out of scope for this feature.
- **Hybrid Recipe Sourcing**: PASS — curated and AI share one schema; curated
  CRUD is deterministic; AI generation is explicitly out of scope but schema
  includes `source` for future AI emitters; dietary tags support later AI/plan
  validation.
- **Speckit-Driven Modularity**: PASS — Recipe/Ingredient/Unit catalogs are
  Speckit domain modules; HTTP remains transport-only; depends on household +
  dietary restriction catalog from prior features.
- **Extensibility**: PASS — module declares purpose (curated library + shared
  schema) and dependencies (household, dietary catalog); future
  `RecipeHybridEngine` can emit the same shape without breaking contracts.

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required. Design
keeps grocery/pantry/planning as consumers only; unit and dietary catalogs are
additive Speckit modules without new workflows that would break
`GenerateWeeklyMeals` / `BuildGroceryList` contracts.

## Project Structure

### Documentation (this feature)

```text
specs/003-recipe/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── recipes.openapi.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── recipe.ts                 # Normalize, validate, limits, shared schema types
│   ├── ingredient-units.ts       # Predefined unit catalog
│   ├── dietary-restrictions.ts   # Reuse (dietary tags on recipes)
│   ├── preference-profile.ts     # Dependency only (not modified for recipe CRUD)
│   ├── family-member.ts          # Dependency only
│   └── errors.ts                 # UNKNOWN_UNIT, RECIPE_LIMIT, RECIPE_LIBRARY_FULL
├── services/
│   └── recipe-service.ts         # create/list/get/replace/delete
├── db/
│   ├── schema.ts                 # Add recipes table
│   ├── client.ts                 # Reuse DEFAULT_HOUSEHOLD_ID
│   └── migrations/               # New migration for recipes
├── api/
│   ├── app.ts                    # Mount recipe routes
│   └── routes/
│       ├── family-members.ts     # Unchanged ownership
│       └── recipes.ts            # Recipe + unit catalog routes
└── index.ts

tests/
├── contract/
│   └── recipes.contract.test.ts
├── integration/
│   └── recipe.integration.test.ts
└── unit/
    ├── recipe.test.ts
    └── ingredient-units.test.ts
```

**Structure Decision**: Continue the single-project layout from
`001-family-member` / `002-preference-profile`. Add a dedicated `RecipeService`
and `src/domain/recipe.ts` rather than folding into FamilyMemberService—
recipes are a separate constitution entity with household scope, not member
scope.

## Complexity Tracking

> No constitution violations requiring justification.
