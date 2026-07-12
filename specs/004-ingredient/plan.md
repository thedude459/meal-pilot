# Implementation Plan: Ingredients

**Branch**: `004-ingredient` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-ingredient/spec.md`

## Summary

Deliver a household-scoped Ingredient catalog as a first-class Speckit module on
the existing TypeScript + Hono + SQLite stack. Organizers create, list (A–Z),
view, full-replace, and permanently delete catalog Ingredients with normalized
display names, required default units (reuse Recipes unit catalog), optional
shopping categories (new predefined catalog), and ordered aliases. Label
uniqueness is case-insensitive across display names and aliases within a
household after whitespace normalization. Recipe free-text ingredient lines are
unchanged; pantry/grocery consume this identity later.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Hono (HTTP API), Zod (validation), Drizzle ORM +
better-sqlite3 (persistence), Vitest (tests)

**Storage**: SQLite — new `ingredients` table scoped by `household_id` (reuse
`DEFAULT_HOUSEHOLD_ID` pattern). Columns include `display_name_key` with unique
index `(household_id, display_name_key)`. Ordered aliases stored as JSON text
(same pattern as preference profiles / recipe tag arrays). Optional
`shopping_category_id` nullable text FK-by-catalog (no DB FK table).

**Testing**: Vitest for unit (normalize/validate labels + shopping catalog),
integration (CRUD + uniqueness + household isolation + limits), and contract
(ingredients OpenAPI). Quickstart smoke remains the manual acceptance path.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); API consumed by
a future organizer UI and later pantry / grocery / matching modules

**Project Type**: Single-project modular domain service + HTTP API

**Performance Goals**: Organizer can add a typical ingredient in under 2 minutes
(SC-002). Sub-200ms list/get/replace for ≤500 ingredients is a stretch target;
no load harness required in `004` tasks. Quickstart + Vitest are the acceptance
path.

**Constraints**: Deterministic catalog paths only; reuse `ingredient-units`
catalog; shopping categories from predefined catalog; display name/alias ≤80
chars after normalization; ≤20 aliases; ≤500 ingredients/household; trim +
collapse Unicode whitespace (`\s`); case-insensitive uniqueness across
names+aliases via `display_name_key` + service alias checks; reject own
display-name/alias conflicts without silent drops; clear category with required
`null` on PUT; clear aliases with required `[]` on PUT; omit on PUT →
`VALIDATION_ERROR`; list A–Z case-insensitive; last-write-wins full replace;
field limits → `INGREDIENT_LIMIT` (400); catalog full → `INGREDIENT_CATALOG_FULL`
(409); label conflicts → `INGREDIENT_LABEL_CONFLICT` (409); no business logic
outside Speckit domain modules; do not modify Recipe free-text lines

**Scale/Scope**: 1 household (v1 default), ≤500 ingredients; recipe↔catalog
linking, dietary flags on ingredients, pantry quantities, and grocery generation
out of delivery scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: PASS — no dietary flags on Ingredient in v1;
  preference/restriction matching stays at member/recipe/meal levels; this
  feature does not override preferences.
- **Balanced Weekly Planning**: N/A — out of scope for this feature.
- **Automatic Grocery Generation**: N/A for delivery — Ingredient identity and
  shopping category are the foundation grocery will use later; no list built
  here.
- **Pantry-Aware Inventory**: N/A for delivery — catalog identity only; pantry
  quantities out of scope.
- **Hybrid Recipe Sourcing**: PASS — Recipes remain free-text ingredient lines
  (FR-013); this module does not fork recipe schema or AI paths; non-AI catalog
  CRUD is deterministic.
- **Speckit-Driven Modularity**: PASS — Ingredient, ShoppingCategory, and reuse
  of Unit catalogs are Speckit domain modules; HTTP remains transport-only;
  depends on household + ingredient-units from prior features.
- **Extensibility**: PASS — module declares purpose (shared food identity +
  shopping category for later GroceryItem/PantryItem) and dependencies
  (household, unit catalog); future matching/grocery can consume without
  breaking recipe contracts.

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required. Design keeps
recipes free-text and grocery/pantry as consumers only; shopping-category and
ingredient catalog modules are additive without new workflows that would break
`GenerateWeeklyMeals` / `BuildGroceryList` contracts.

## Project Structure

### Documentation (this feature)

```text
specs/004-ingredient/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ingredients.openapi.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── ingredient.ts              # Normalize, validate, limits, uniqueness helpers
│   ├── shopping-categories.ts     # Predefined shopping-category catalog
│   ├── ingredient-units.ts        # Reuse (defaultUnitId)
│   ├── recipe.ts                  # Unchanged; free-text recipe lines remain
│   ├── errors.ts                  # INGREDIENT_LIMIT, INGREDIENT_CATALOG_FULL,
│   │                              # INGREDIENT_LABEL_CONFLICT, UNKNOWN_SHOPPING_CATEGORY
│   └── …
├── services/
│   └── ingredient-service.ts      # create/list/get/replace/delete
├── db/
│   ├── schema.ts                  # Add ingredients table
│   ├── client.ts                  # Reuse DEFAULT_HOUSEHOLD_ID
│   └── migrations/                # New migration for ingredients
├── api/
│   ├── app.ts                     # Mount ingredient routes
│   └── routes/
│       ├── recipes.ts             # Unchanged ownership of /ingredient-units
│       └── ingredients.ts         # Ingredient + shopping-category catalog routes
└── index.ts

tests/
├── contract/
│   └── ingredients.contract.test.ts
├── integration/
│   └── ingredient.integration.test.ts
└── unit/
    ├── ingredient.test.ts
    └── shopping-categories.test.ts
```

**Structure Decision**: Continue the single-project layout from
`001`–`003`. Add a dedicated `IngredientService` and `src/domain/ingredient.ts`
rather than folding into RecipeService—constitution Ingredient is a household
catalog entity distinct from recipe embedded free-text lines.

Naming: domain module `src/domain/ingredient.ts` is the **catalog** Ingredient
entity. Recipe embedded lines remain free-text objects in `src/domain/recipe.ts`
(do not rename them to share this type; no FK in v1).

## Complexity Tracking

> No constitution violations requiring justification.
