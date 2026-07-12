# Implementation Plan: Pantry Items

**Branch**: `005-pantry-item` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-pantry-item/spec.md`

## Summary

Deliver household-scoped PantryItem inventory as a first-class Speckit module on
the existing TypeScript + Hono + SQLite stack. Organizers create, list (A–Z by
Ingredient display name), view, full-replace, and permanently delete pantry
stock rows linked 1:1 to catalog Ingredients. Quantity is a positive decimal
(≤3 places, shared with Recipes); unit MUST equal the Ingredient’s current
default unit; expiration is optional calendar date (past/today/future allowed;
required `null` on PUT to clear). Ingredient catalog delete is blocked while
pantry stock references that Ingredient. UpdatePantry / grocery subtraction
remain out of delivery scope.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Hono (HTTP API), Zod (validation), Drizzle ORM +
better-sqlite3 (persistence), Vitest (tests)

**Storage**: SQLite — new `pantry_items` table scoped by `household_id` (reuse
`DEFAULT_HOUSEHOLD_ID` pattern). Columns: `ingredient_id` (FK to `ingredients`),
`quantity` (real), `unit_id` (text catalog id), nullable `expiration_date`
(ISO date `YYYY-MM-DD`). Unique index `(household_id, ingredient_id)` enforces
one stock row per Ingredient.

**Testing**: Vitest for unit (quantity rounding, expiration date parse,
unit-vs-default checks), integration (CRUD + duplicate Ingredient + Ingredient
delete block + household isolation + limits), and contract (pantry OpenAPI).
Quickstart smoke remains the manual acceptance path.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); API consumed by
a future organizer UI and later grocery / UpdatePantry modules

**Project Type**: Single-project modular domain service + HTTP API

**Performance Goals**: Organizer can record a typical pantry item in under 2
minutes (SC-002). Sub-200ms list/get/replace for ≤500 pantry items is a stretch
target; no load harness required in `005` tasks. Quickstart + Vitest are the
acceptance path.

**Constraints**: Deterministic inventory paths only; reuse `ingredient-units`
and Ingredient catalog; quantity > 0 finite, round to ≤3 decimals (reuse Recipe
`QUANTITY_DECIMAL_PLACES` / shared helper); unit MUST equal linked Ingredient
`defaultUnitId` at create/replace; expiration ISO date or null; on PUT
`quantity`, `unitId`, and `expirationDate` all required (`null` clears
expiration; omit → `VALIDATION_ERROR`); list A–Z by Ingredient display name
case-insensitive; last-write-wins full replace; ≤500 pantry items/household;
error split — missing/malformed required fields → `VALIDATION_ERROR` (400);
bad quantity magnitude/non-finite after checks, or invalid `YYYY-MM-DD`
expiration format → `PANTRY_LIMIT` (400); unknown unit → `UNKNOWN_UNIT` (400);
unit ≠ Ingredient default → `UNIT_MISMATCH` (400); inventory full →
`PANTRY_INVENTORY_FULL` (409); duplicate Ingredient stock →
`PANTRY_INGREDIENT_CONFLICT` (409); Ingredient delete while stocked →
`INGREDIENT_IN_USE` (409); unknown Ingredient → `NOT_FOUND` (404); no business
logic outside Speckit domain modules; no UpdatePantry / grocery subtraction in
this feature

**Scale/Scope**: 1 household (v1 default), ≤500 pantry items; multi-lot stock,
unit conversion, auto inventory from grocery, and grocery list generation out of
delivery scope

**Follow-on features** (constitution Principle IV — deferred, not waived):
- `BuildGroceryList` MUST subtract PantryItem quantities when generating lists
- `UpdatePantry` / `PantryManager` MUST auto-adjust stock after confirmed grocery
  completion
These remain separate Speckit features that consume this module’s inventory.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: PASS — pantry stock does not attach or
  override preferences/restrictions.
- **Balanced Weekly Planning**: N/A — out of scope for this feature.
- **Automatic Grocery Generation**: N/A for delivery — PantryItem quantities are
  the foundation grocery will subtract later; no list built here.
- **Pantry-Aware Inventory**: PASS for foundation — PantryItem tracks quantity,
  unit, and optional expiration; grocery subtraction and automatic updates after
  confirmed shopping are deferred to BuildGroceryList / UpdatePantry (explicitly
  out of delivery scope, not a silent override of the principle).
- **Hybrid Recipe Sourcing**: PASS — no recipe schema or AI path changes;
  non-AI pantry CRUD is deterministic.
- **Speckit-Driven Modularity**: PASS — PantryItem domain module +
  PantryItemService; HTTP transport-only; depends on household, Ingredient
  catalog, and ingredient-units; Ingredient delete gains a pantry reference
  check without folding pantry logic into the Ingredient domain module.
- **Extensibility**: PASS — module declares purpose (on-hand stock for later
  grocery subtract / UpdatePantry) and dependencies (Ingredient, unit catalog,
  household); does not break GenerateWeeklyMeals / BuildGroceryList contracts.

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required. Design
supplies inventory CRUD + Ingredient-in-use guard; grocery/UpdatePantry remain
consumers only (see **Follow-on features** — deferred, not waived).
`PantryItemService` is the entity foundation; constitution `PantryManager`
arrives with UpdatePantry.

## Project Structure

### Documentation (this feature)

```text
specs/005-pantry-item/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── pantry-items.openapi.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── pantry-item.ts             # Validate quantity, unit-vs-default, expiration
│   ├── quantity.ts                # Shared roundQuantity / QUANTITY_DECIMAL_PLACES
│   │                              # (extract from recipe.ts for reuse)
│   ├── ingredient.ts              # Unchanged catalog rules; service gains in-use check
│   ├── ingredient-units.ts        # Reuse
│   ├── recipe.ts                  # Import shared quantity helper
│   ├── errors.ts                  # PANTRY_LIMIT, PANTRY_INVENTORY_FULL,
│   │                              # PANTRY_INGREDIENT_CONFLICT, INGREDIENT_IN_USE,
│   │                              # UNIT_MISMATCH
│   └── …
├── services/
│   ├── pantry-item-service.ts     # create/list/get/replace/delete (+ join display name)
│   └── ingredient-service.ts      # deleteIngredient blocks when pantry row exists
├── db/
│   ├── schema.ts                  # Add pantry_items table
│   ├── client.ts                  # Reuse DEFAULT_HOUSEHOLD_ID
│   └── migrations/                # New migration for pantry_items
├── api/
│   ├── app.ts                     # Mount pantry routes
│   └── routes/
│       └── pantry-items.ts        # PantryItem CRUD routes
└── index.ts

tests/
├── contract/
│   └── pantry-items.contract.test.ts
├── integration/
│   └── pantry-item.integration.test.ts
└── unit/
    └── pantry-item.test.ts
```

**Structure Decision**: Continue the single-project layout from `001`–`004`. Add
a dedicated `PantryItemService` and `src/domain/pantry-item.ts` rather than
folding into IngredientService—constitution PantryItem is inventory stock, not
catalog identity. IngredientService only gains a delete-time reference check
against `pantry_items`. Naming note: constitution lists `PantryManager` as the
future workflow/service for automatic pantry updates; `PantryItemService` is the
entity CRUD foundation that `PantryManager` / `UpdatePantry` will consume later.

## Complexity Tracking

> No constitution violations requiring justification.
