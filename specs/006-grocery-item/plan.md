# Implementation Plan: Grocery Items

**Branch**: `006-grocery-item` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-grocery-item/spec.md`

## Summary

Deliver household-scoped GroceryItem shopping-list lines as a first-class
Speckit module on the existing TypeScript + Hono + SQLite stack. Organizers
create, list (grouped by Ingredient shopping-category catalog order, "Other"
last; A–Z by Ingredient name within groups regardless of checked status), view,
full-replace quantity/unit, toggle purchased status via a dedicated endpoint,
and permanently delete grocery lines linked 1:1 to catalog Ingredients.
Quantity is a positive decimal (≤3 places, shared `quantity` helper); unit MUST
equal the Ingredient’s current default unit; new lines start unchecked.
Duplicate Ingredient adds are rejected. Ingredient catalog delete is blocked
while a grocery line (or pantry stock) references that Ingredient.
BuildGroceryList generation, pantry subtraction, UpdatePantry, export, and bulk
clear of checked items remain out of delivery scope.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Hono (HTTP API), Zod (validation), Drizzle ORM +
better-sqlite3 (persistence), Vitest (tests)

**Storage**: SQLite — new `grocery_items` table scoped by `household_id` (reuse
`DEFAULT_HOUSEHOLD_ID` pattern). Columns: `ingredient_id` (FK to `ingredients`),
`quantity` (real), `unit_id` (text catalog id), `checked` (integer 0/1). Unique
index `(household_id, ingredient_id)` enforces one grocery line per Ingredient.

**Testing**: Vitest for unit (quantity rounding, unit-vs-default, checked toggle
rules, category grouping/sort), integration (CRUD + duplicate Ingredient + check
toggle + Ingredient delete block + household isolation + limits), and contract
(grocery OpenAPI). Quickstart smoke remains the manual acceptance path.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); API consumed by
a future organizer UI and later BuildGroceryList / UpdatePantry modules

**Project Type**: Single-project modular domain service + HTTP API

**Performance Goals**: Organizer can add a typical grocery item in under 2
minutes (SC-002). Sub-200ms list/get/replace/toggle for ≤500 grocery items is a
stretch target; no load harness required in `006` tasks. Quickstart + Vitest are
the acceptance path.

**Constraints**: Deterministic grocery-list paths only; reuse
`ingredient-units`, shopping-categories catalog, Ingredient catalog, and shared
`quantity` helper; quantity > 0 finite, round to ≤3 decimals; unit MUST equal
linked Ingredient `defaultUnitId` at create/replace; new items `checked=false`;
create MUST reject body that includes `checked` (`VALIDATION_ERROR`); dedicated
check toggle only changes `checked` (does not accept quantity/unit) and is
outside FR-002 omit-quantity/unit rules; PUT full replace requires `quantity` +
`unitId` only — reject if `checked` or `ingredientId` present; list groups by
effective shopping category (`ingredient.shoppingCategoryId` or `"other"`) in
`SHOPPING_CATEGORIES` catalog order with Other last; within group A–Z by
Ingredient display name case-insensitive regardless of checked;
last-write-wins for replace and toggle; ≤500 grocery items/household; no bulk
remove/uncheck; delete confirmation is UI-only (no confirm API); error split —
missing/malformed required fields or unexpected `checked`/`ingredientId` on
PUT (or `checked` on create) → `VALIDATION_ERROR` (400); bad quantity
magnitude/non-finite → `GROCERY_LIMIT` (400); unknown unit → `UNKNOWN_UNIT`
(400); unit ≠ Ingredient default → `UNIT_MISMATCH` (400); list full →
`GROCERY_LIST_FULL` (409); duplicate Ingredient line →
`GROCERY_INGREDIENT_CONFLICT` (409); Ingredient delete while referenced by
grocery (or pantry) → `INGREDIENT_IN_USE` (409); unknown Ingredient →
`NOT_FOUND` (404); no business logic outside Speckit domain modules; no
BuildGroceryList / UpdatePantry / export in this feature

**Scale/Scope**: 1 household (v1 default), ≤500 grocery items; multi-list
documents, quantity-merge on duplicate add, bulk clear checked, unit conversion,
auto list from WeeklyPlan, pantry subtract during generation, and export out of
delivery scope

**Follow-on features** (constitution Principles III–IV — deferred, not waived):
- `BuildGroceryList` / `GroceryListBuilder` MUST generate/merge GroceryItems from
  approved meals and subtract PantryItem stock
- `UpdatePantry` MUST consume checked/confirmed grocery lines to adjust pantry
- Export to external services MUST consume the grocery list
These remain separate Speckit features that consume this module’s lines.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: PASS — grocery lines do not attach or override
  preferences/restrictions.
- **Balanced Weekly Planning**: N/A — out of scope for this feature.
- **Automatic Grocery Generation**: N/A for delivery — GroceryItem lines are the
  foundation BuildGroceryList will write into; no list auto-built from meals
  here (deferred, not waived).
- **Pantry-Aware Inventory**: N/A for delivery — pantry subtraction during
  generation and UpdatePantry after confirmation are deferred; this feature does
  not modify PantryItem stock and does not include sufficient pantry items on a
  generated list (no generation yet).
- **Hybrid Recipe Sourcing**: PASS — no recipe schema or AI path changes;
  non-AI grocery CRUD is deterministic.
- **Speckit-Driven Modularity**: PASS — GroceryItem domain module +
  GroceryItemService; HTTP transport-only; depends on household, Ingredient
  catalog, unit catalog, shopping-categories; Ingredient delete gains a grocery
  reference check (alongside existing pantry check) without folding grocery
  logic into the Ingredient domain module.
- **Extensibility**: PASS — module declares purpose (shopping-list lines for
  later BuildGroceryList / UpdatePantry) and dependencies (Ingredient, units,
  shopping categories, household); does not break GenerateWeeklyMeals /
  BuildGroceryList / UpdatePantry contracts.

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required. Design
supplies grocery-line CRUD + check toggle + Ingredient-in-use guard;
BuildGroceryList / UpdatePantry / export remain consumers only (see **Follow-on
features** — deferred, not waived). `GroceryItemService` is the entity
foundation; constitution `GroceryListBuilder` arrives with BuildGroceryList.

## Project Structure

### Documentation (this feature)

```text
specs/006-grocery-item/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── grocery-items.openapi.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── grocery-item.ts            # Validate quantity, unit-vs-default, checked
│   ├── quantity.ts                # Reuse shared roundQuantity
│   ├── shopping-categories.ts     # Reuse catalog order for list groups
│   ├── ingredient.ts              # Unchanged catalog rules
│   ├── ingredient-units.ts        # Reuse
│   ├── errors.ts                  # GROCERY_LIMIT, GROCERY_LIST_FULL,
│   │                              # GROCERY_INGREDIENT_CONFLICT
│   │                              # (reuse UNIT_MISMATCH, INGREDIENT_IN_USE)
│   └── …
├── services/
│   ├── grocery-item-service.ts    # create/list/get/replace/setChecked/delete
│   ├── ingredient-service.ts      # deleteIngredient also blocks when grocery
│   │                              # row exists (assertIngredientNotInGrocery)
│   └── pantry-item-service.ts     # Existing pantry in-use assert unchanged
├── db/
│   ├── schema.ts                  # Add grocery_items table
│   ├── client.ts                  # Reuse DEFAULT_HOUSEHOLD_ID
│   └── migrations/                # New migration for grocery_items
├── api/
│   ├── app.ts                     # Mount grocery routes
│   └── routes/
│       └── grocery-items.ts       # GroceryItem CRUD + checked toggle routes
└── index.ts

tests/
├── contract/
│   └── grocery-items.contract.test.ts
├── integration/
│   └── grocery-item.integration.test.ts
└── unit/
    └── grocery-item.test.ts
```

**Structure Decision**: Continue the single-project layout from `001`–`005`. Add
a dedicated `GroceryItemService` and `src/domain/grocery-item.ts` rather than
folding into IngredientService or PantryItemService—constitution GroceryItem is
a shopping-list line, not catalog identity or pantry stock. IngredientService
gains a delete-time reference check against `grocery_items` in addition to the
existing pantry check. Naming note: constitution lists `GroceryListBuilder` as
the future workflow/service for automatic list generation; `GroceryItemService`
is the entity CRUD foundation that `GroceryListBuilder` / `BuildGroceryList`
will consume later.

## Complexity Tracking

> No constitution violations requiring justification.
