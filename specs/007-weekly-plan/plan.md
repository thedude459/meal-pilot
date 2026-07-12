# Implementation Plan: Weekly Plans

**Branch**: `007-weekly-plan` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-weekly-plan/spec.md`

## Summary

Deliver household-scoped WeeklyPlan entities as a first-class Speckit module on
the existing TypeScript + Hono + SQLite stack. Organizers create a plan for a
Monday week-start (optionally with initial day→Recipe assignments), list plans
(newest week-start first), view plan detail with seven day slots and Recipe
titles, perform per-slot assign/replace / clear / status actions, and
permanently delete plans. Filled slots use canonical statuses `pending` |
`approved` | `rejected` (default `pending` on assign/replace). Same Recipe may
appear on multiple days. Recipe library delete is blocked while any slot
references that Recipe. GenerateWeeklyMeals, post-reject alternatives,
multi-meal-types-per-day, and BuildGroceryList from approved meals remain out
of delivery scope.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Hono (HTTP API), Zod (validation), Drizzle ORM +
better-sqlite3 (persistence), Vitest (tests)

**Storage**: SQLite — new `weekly_plans` table scoped by `household_id` (reuse
`DEFAULT_HOUSEHOLD_ID` pattern) with `week_start_date` (ISO `YYYY-MM-DD`,
Monday only) and unique index `(household_id, week_start_date)`. New
`meal_slots` table: one row per filled day (`weekly_plan_id`, `day` enum
monday–sunday, `recipe_id`, `status` pending|approved|rejected). Empty days
have no row. Unique `(weekly_plan_id, day)`. Index on `recipe_id` for Recipe
delete in-use checks.

**Testing**: Vitest for unit (Monday week-start validation, status transitions,
empty-slot status reject, same-Recipe multi-day allow), integration (CRUD +
per-slot ops + duplicate week + Recipe delete block + household isolation +
cap 104), and contract (weekly-plans OpenAPI). Quickstart smoke remains the
manual acceptance path.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); API consumed by
a future organizer UI and later GenerateWeeklyMeals / BuildGroceryList modules

**Project Type**: Single-project modular domain service + HTTP API

**Performance Goals**: Organizer can create a typical weekly plan (week-start +
most days assigned) in under 5 minutes (SC-002). Sub-200ms list/get/slot ops for
≤104 plans is a stretch target; no load harness required in `007` tasks.
Quickstart + Vitest are the acceptance path.

**Constraints**: Deterministic plan paths only; Monday week-start validated in
UTC calendar terms (`YYYY-MM-DD` whose weekday is Monday); past/current/future
weeks allowed; create with week-start only allowed; per-slot assign/replace
clear removes slot row (idempotent empty clear returns 200 + plan); status
action only on filled slots; week-start immutable after create (no plan-level
week-start update API); same Recipe allowed on multiple days; ≤104
plans/household; last-write-wins per slot; Recipe delete blocked while
referenced (`RECIPE_IN_USE`); error split — malformed/missing fields,
non-Monday date, invalid day/status → `VALIDATION_ERROR` (400); duplicate week
→ `WEEKLY_PLAN_CONFLICT` (409); library full → `WEEKLY_PLAN_LIBRARY_FULL`
(409); unknown Recipe/plan → `NOT_FOUND` (404); no business logic outside
Speckit domain modules; no GenerateWeeklyMeals / BuildGroceryList / alternative
suggestions in this feature

**Scale/Scope**: 1 household (v1 default), ≤104 weekly plans, 7 day slots max
per plan (one meal per day); breakfast/lunch/dinner tracks, auto-generation,
rotation scoring, and grocery derivation out of delivery scope

**Follow-on features** (constitution Principles I–III — deferred, not waived):
- `GenerateWeeklyMeals` / `MealSuggestionEngine` MUST write candidate meals into
  WeeklyPlan slots (may introduce a distinct suggested/engine-proposed concept
  later without renaming `pending`)
- Rejected slots MUST trigger alternative suggestions in that follow-on
- `BuildGroceryList` / `GroceryListBuilder` MUST read approved WeeklyPlan meals
These remain separate Speckit features that consume this module’s plans.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: PASS — this feature does not evaluate or
  override preferences; later GenerateWeeklyMeals consumers must honor them
  when writing into WeeklyPlan.
- **Balanced Weekly Planning**: N/A for delivery — variety/nutrition/rotation
  scoring and auto-generation are deferred; WeeklyPlan is the durable store
  those planners will write into (deferred, not waived).
- **Automatic Grocery Generation**: N/A for delivery — approved slots are the
  foundation BuildGroceryList will read; no grocery build here (deferred, not
  waived).
- **Pantry-Aware Inventory**: N/A — no grocery/pantry mutation in this feature.
- **Hybrid Recipe Sourcing**: PASS — only references existing Recipes; no
  schema or AI path changes; non-AI plan CRUD is deterministic.
- **Speckit-Driven Modularity**: PASS — WeeklyPlan domain module +
  WeeklyPlanService; HTTP transport-only; depends on household and Recipe
  library; Recipe delete gains a plan-slot reference check without folding plan
  logic into the Recipe domain module.
- **Extensibility**: PASS — module declares purpose (structured weekly meals +
  approval for later GenerateWeeklyMeals / BuildGroceryList) and dependencies
  (Recipe, household); does not break GenerateWeeklyMeals / BuildGroceryList /
  UpdatePantry contracts.

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required. Design
supplies WeeklyPlan CRUD + per-slot ops + Recipe-in-use guard;
GenerateWeeklyMeals / BuildGroceryList remain consumers/writers only (see
**Follow-on features** — deferred, not waived). `WeeklyPlanService` is the
entity foundation; constitution `MealSuggestionEngine` arrives with
GenerateWeeklyMeals.

## Project Structure

### Documentation (this feature)

```text
specs/007-weekly-plan/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── weekly-plans.openapi.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── weekly-plan.ts             # Monday week-start, day enum, status rules
│   ├── errors.ts                  # WEEKLY_PLAN_CONFLICT, WEEKLY_PLAN_LIBRARY_FULL,
│   │                              # RECIPE_IN_USE
│   └── …
├── services/
│   ├── weekly-plan-service.ts     # create/list/get/delete + per-slot ops
│   └── recipe-service.ts          # deleteRecipe also blocks when meal_slots
│                                  # row references recipe (assertRecipeNotInPlan)
├── db/
│   ├── schema.ts                  # Add weekly_plans + meal_slots tables
│   ├── client.ts                  # Reuse DEFAULT_HOUSEHOLD_ID
│   └── migrations/                # New migration for weekly_plans + meal_slots
├── api/
│   ├── app.ts                     # Mount weekly-plan routes
│   └── routes/
│       └── weekly-plans.ts        # Plan CRUD + slot assign/clear/status routes
└── index.ts

tests/
├── contract/
│   └── weekly-plans.contract.test.ts
├── integration/
│   └── weekly-plan.integration.test.ts
└── unit/
    └── weekly-plan.test.ts
```

**Structure Decision**: Continue the single-project layout from `001`–`006`. Add
a dedicated `WeeklyPlanService` and `src/domain/weekly-plan.ts` rather than
folding into RecipeService—constitution WeeklyPlan is a week-scoped meal list
with approval, not recipe library content. RecipeService gains a delete-time
reference check against `meal_slots`. Naming note: constitution lists
`MealSuggestionEngine` for GenerateWeeklyMeals; `WeeklyPlanService` is the
entity CRUD foundation that engine and BuildGroceryList will consume later.

## Complexity Tracking

> No constitution violations requiring justification.
