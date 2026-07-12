# Implementation Plan: Build Grocery List

**Branch**: `009-build-grocery-list` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-build-grocery-list/spec.md`

## Summary

Deliver the constitution **BuildGroceryList** workflow as `GroceryListBuilder`
on the existing TypeScript + Hono + SQLite stack. Organizers run a build for a
Monday week-start WeeklyPlan; the builder extracts ingredient lines from
**approved** slots only, matches free-text Recipe names to catalog Ingredients
(display name / aliases), merges quantities (default unit only), subtracts
available (non-expired UTC) pantry stock, and syncs unchecked GroceryItems while
preserving checked lines. Soft-complete with a `BuildReport` for unmatched names,
unit conflicts, pantry-covered items, and checked shortfalls. Export and
UpdatePantry remain deferred (not waived).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Hono (HTTP API), Zod (validation), Drizzle ORM +
better-sqlite3 (persistence), Vitest (tests)

**Storage**: SQLite — no new durable grocery-list document. Reuse
`grocery_items` (write), `weekly_plans` + `meal_slots` (approved reads),
`recipes` (+ ingredients JSON), `ingredients` (+ aliases), `pantry_items`.
Build is a workflow over existing tables; `BuildReport` is response-only.

**Testing**: Vitest for unit (name/alias match, unit-conflict merge, pantry
availability/expiration UTC, net-need math, merged-set membership, checked
shortfall, rebuild remove vs leave rules, quantity rounding), integration
(build from approved meals, ignore pending/rejected, pantry partial/full/expired,
checked preserve + shortfall report, manual out-of-set unchecked leave, cap fail
atomic, zero-approved / missing plan / non-Monday), and contract
(build-grocery-list OpenAPI). Quickstart smoke is the manual acceptance path.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); API consumed by
a future organizer UI; UpdatePantry remains a later consumer of checked lines

**Project Type**: Single-project modular domain service + HTTP API

**Performance Goals**: Organizer interaction time under 2 minutes for build +
open list (SC-001). Stretch: a local build for ≤7 approved recipes / ≤500
catalog ingredients / ≤500 grocery lines completes in a few seconds; no load
harness required in `009` tasks. Quickstart + Vitest are the acceptance path.

**Constraints**: Deterministic path; Monday week-start (UTC calendar, reuse
`007`); approved slots only; match via `normalizeIngredientLabel` +
case-insensitive label keys (display name + aliases); no fuzzy match; no unit
conversion; no servings scaling; expired pantry (expiration &lt; today UTC) not
subtracted; missing expiration = available; checked lines never mutated/deleted;
checked qty &lt; net need → report remaining shortfall; remove unchecked only for
merged-set ingredients with net need 0; leave unchecked outside merged set;
name-matched + all unit conflicts still in merged set (qty 0); grocery cap 500
with atomic fail (`GROCERY_LIST_FULL`); no pantry/plan/recipe mutation; export
deferred (not waived); UpdatePantry out of scope; error split — validation /
zero approved → `VALIDATION_ERROR` or `BUILD_NO_APPROVED_MEALS` (400); unknown
plan → `NOT_FOUND` (404); cap → `GROCERY_LIST_FULL` (409); no business logic
outside Speckit domain modules

**Scale/Scope**: 1 household (v1 default), ≤500 grocery items, ≤7 approved days
per week, ≤60 ingredients per recipe; export, UpdatePantry, unit conversion,
servings scaling, multi-week merge, store-specific layouts out of delivery scope

**Follow-on features** (constitution — deferred, not waived):
- Export grocery lists to external services
- UpdatePantry after shopping confirmation (consume checked GroceryItems)
- Unit conversion and servings-based quantity scaling
- Store-specific / budget-aware list variants

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: N/A for delivery — preferences already applied
  during planning/approval; BuildGroceryList does not re-filter meals.
- **Balanced Weekly Planning**: N/A — does not generate or alter meal plans.
- **Automatic Grocery Generation**: PASS for extract/merge/dedupe/categorize —
  export to external services is **deferred, not waived** (constitution MUST;
  follow-on feature required; same pattern as `008` hybrid AI deferral).
- **Pantry-Aware Inventory**: PASS for grocery subtraction — never list fully
  covered items as unchecked buys; expired stock not available; automatic pantry
  updates after shopping confirmation are **deferred, not waived**
  (`UpdatePantry` follow-on).
- **Hybrid Recipe Sourcing**: PASS — reads Recipes regardless of source; does
  not create AI recipes; path is deterministic.
- **Speckit-Driven Modularity**: PASS — `GroceryListBuilder` + BuildGroceryList
  workflow defined as Speckit specs; writes through GroceryItem model/service;
  HTTP transport-only.
- **Extensibility**: PASS — declares purpose (build from approved meals + pantry
  subtract) and dependencies (WeeklyPlan, Recipe, Ingredient, PantryItem,
  GroceryItem); does not break GenerateWeeklyMeals or future UpdatePantry
  contracts.

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required. Design
supplies `POST /grocery-items/build`, pure extract/merge/subtract helpers, and
atomic grocery sync. Post-analyze remediation (2026-07-12): C1 accepted as
**deferred-not-waived** export + UpdatePantry (not silent waiver); quickstart
plan-id discovery fixed; US4 pantry scenarios merged; performance stretch
worded as “few seconds”; tasks reuse `WeeklyPlanService.findByWeekStart`.

## Project Structure

### Documentation (this feature)

```text
specs/009-build-grocery-list/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── build-grocery-list.openapi.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── grocery-list-builder.ts    # Match/merge/subtract/report pure functions
│   ├── grocery-item.ts            # Reuse quantity/unit/checked rules
│   ├── ingredient.ts              # Reuse normalizeIngredientLabel / labelKey
│   ├── quantity.ts                # Reuse roundQuantity
│   ├── weekly-plan.ts             # Reuse Monday check / slot status
│   ├── errors.ts                  # Add BUILD_NO_APPROVED_MEALS; reuse
│   │                              # VALIDATION_ERROR, NOT_FOUND, GROCERY_LIST_FULL
│   └── …
├── services/
│   ├── grocery-list-builder-service.ts  # BuildGroceryList orchestration +
│   │                                    # atomic grocery sync
│   ├── grocery-item-service.ts          # Reuse create/replace/delete/list;
│   │                                    # may add internal sync helpers
│   ├── weekly-plan-service.ts           # Read plan by weekStartDate + slots
│   ├── recipe-service.ts                # Read Recipes for approved slots
│   ├── ingredient-service.ts            # Read catalog for match index
│   └── pantry-item-service.ts           # Read pantry for subtraction
├── db/
│   ├── schema.ts                  # No new tables required for v1
│   └── …
├── api/
│   ├── app.ts                     # Mount build route on grocery-items
│   └── routes/
│       ├── grocery-items.ts       # Existing CRUD + checked
│       └── build-grocery-list.ts  # POST /grocery-items/build
└── index.ts

tests/
├── contract/
│   └── build-grocery-list.contract.test.ts
├── integration/
│   └── build-grocery-list.integration.test.ts
└── unit/
    └── grocery-list-builder.test.ts
```

**Structure Decision**: Continue the single-project layout from `001`–`008`. Add
`GroceryListBuilder` as `grocery-list-builder-service.ts` + pure domain helpers
in `grocery-list-builder.ts`, rather than folding merge/subtract into
GroceryItemService. GroceryItem remains the durable store; build is a workflow
writer into that store. No new SQLite tables.

## Complexity Tracking

> No constitution violations requiring justification.
