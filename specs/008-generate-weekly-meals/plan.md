# Implementation Plan: Generate Weekly Meals

**Branch**: `008-generate-weekly-meals` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-generate-weekly-meals/spec.md`

## Summary

Deliver the constitution **GenerateWeeklyMeals** workflow as `MealSuggestionEngine`
on the existing TypeScript + Hono + SQLite stack. Organizers generate a
preference-aware WeeklyPlan for a Monday week-start from the household Recipe
library (library-only; no AI Recipes in v1), with modes `fill-empty` (default)
and `regenerate-non-approved`. Hard exclusions use dietary restriction catalog
IDs plus free-text dislike matching against Recipe title and ingredient names.
Soft ranking uses likes, variety/rotation (current week + prior 2 weeks), Recipe
timing metadata, and pantry utilization. Rejecting a filled slot automatically
attempts one alternative in the same flow. Writes reuse WeeklyPlan / MealSlot
from `007`; BuildGroceryList and AI hybrid coverage remain out of delivery scope.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Hono (HTTP API), Zod (validation), Drizzle ORM +
better-sqlite3 (persistence), Vitest (tests)

**Storage**: SQLite — no new durable generation entity. Reuse `weekly_plans` +
`meal_slots` from `007`. Read `family_members` / preference profiles, `recipes`
(+ ingredients JSON), `pantry_items`, and recent weekly plans for rotation.
Generation is a workflow over existing tables.

**Testing**: Vitest for unit (dislike phrase/token match, dietary hard filter,
deterministic ranking/tie-break, mode eligibility, rotation soft-relax),
integration (generate create-or-reuse plan, fill-empty vs regenerate, reject→
alternative, no-preferences reject, partial coverage report, household
isolation), and contract (generate-weekly-meals OpenAPI + extended reject
status response). Quickstart smoke is the manual acceptance path.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); API consumed by
a future organizer UI; BuildGroceryList remains a later consumer of approved
slots

**Project Type**: Single-project modular domain service + HTTP API

**Performance Goals**: Organizer interaction time under 2 minutes for generate +
open plan (SC-001). Engine run for ≤500 recipes / ≤7 days should feel
interactive (stretch: complete generate request under a few seconds locally);
no load harness required in `008` tasks. Quickstart + Vitest are the acceptance
path.

**Constraints**: Deterministic library-only path; Monday week-start (UTC calendar
check, reuse `007`); modes target all eligible days (no day-subset); never
overwrite approved slots; reject→alternative atomic from organizer perspective;
dislike match case-insensitive exact phrase/token on title + ingredient names;
dietary restrictions require every hard restriction ID in Recipe
`dietaryAttributeIds`; rotation window = target week + previous 2 weeks; soft
rules may relax before leaving a day empty; hard rules never relax; no AI recipe
creation (hybrid deferred, not waived); no grocery/pantry mutation; no budget
filter; no nutrition score in v1; error split —
validation / zero members → `VALIDATION_ERROR` or `GENERATION_NO_PREFERENCES`
(400); plan library full on create → `WEEKLY_PLAN_LIBRARY_FULL` (409); unknown
plan on reject path → `NOT_FOUND` (404); no business logic outside Speckit
domain modules

**Scale/Scope**: 1 household (v1 default), ≤500 recipes, ≤104 weekly plans, 7
day slots; AI hybrid Recipes, budget, day-subset generate, organizer-picked
candidate lists, multi-meal-types-per-day, BuildGroceryList out of delivery
scope

**Follow-on features** (constitution — deferred, not waived):
- Hybrid AI recipe creation via `RecipeHybridEngine` when library coverage is
  thin (must share curated schema + dietary validation); ingredient substitution
  and seasonal/budget AI filtering ride with that module
- Nutrition-oriented plan scoring when Recipe nutrition metadata exists
- Budget-aware planning
- BuildGroceryList / UpdatePantry from approved meals

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: PASS — hard exclusions for dietary
  restrictions and dislikes; likes are soft ranking only; no silent overrides.
- **Balanced Weekly Planning**: PASS — soft variety/rotation, cuisine-tag
  diversity, timing/difficulty proxy via Recipe prep/cook minutes; nutrition
  scoring deferred until metadata exists (not waived); budget deferred (not
  waived).
- **Automatic Grocery Generation**: N/A for delivery — approved slots remain
  the input BuildGroceryList will read; no grocery build here (deferred, not
  waived).
- **Pantry-Aware Inventory**: PASS for soft ranking only — pantry boosts score;
  does not hard-block meals or mutate pantry; grocery subtraction remains
  BuildGroceryList (deferred).
- **Hybrid Recipe Sourcing**: PASS for v1 library-only — AI path **deferred, not
  waived** (clarification + post-analyze remediation); non-AI generation is
  deterministic; follow-on `RecipeHybridEngine` MUST still share schema + dietary
  validation. Ingredient substitution / seasonal AI filtering remain with that
  follow-on.
- **Speckit-Driven Modularity**: PASS — `MealSuggestionEngine` + generate
  workflow defined as Speckit specs; writes through WeeklyPlan model/service;
  HTTP transport-only.
- **Extensibility**: PASS — declares purpose (preference-aware weekly
  generation + reject alternatives) and dependencies (WeeklyPlan, Recipe,
  PreferenceProfile, FamilyMember, PantryItem); does not break
  BuildGroceryList / UpdatePantry contracts.

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required. Design
supplies generate modes + MealSuggestionEngine ranking/filter + reject→
alternative; AI hybrid, nutrition scoring, and BuildGroceryList remain
deferred (not waived). Post-analyze remediation (2026-07-12): C1 accepted as
deferred-not-waived hybrid; mode names `fill-empty` /
`regenerate-non-approved`; zero-members-only for `GENERATION_NO_PREFERENCES`.

## Project Structure

### Documentation (this feature)

```text
specs/008-generate-weekly-meals/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── generate-weekly-meals.openapi.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── meal-suggestion.ts         # Match/filter/rank/assign pure functions
│   ├── weekly-plan.ts             # Reuse Monday/day/status helpers
│   ├── preference-profile.ts      # Reuse effective likes/dislikes/restrictions
│   ├── recipe.ts                  # Reuse Recipe shape + timing fields
│   ├── errors.ts                  # Add GENERATION_NO_PREFERENCES (and reuse
│   │                              # VALIDATION_ERROR, WEEKLY_PLAN_LIBRARY_FULL)
│   └── …
├── services/
│   ├── meal-suggestion-service.ts # GenerateWeeklyMeals orchestration +
│   │                              # reject→alternative
│   ├── weekly-plan-service.ts     # Reuse create/get/assign; status reject
│   │                              # delegates alternative via suggestion service
│   ├── recipe-service.ts          # Read library for candidates
│   ├── family-member-service.ts   # Read members + preference profiles
│   └── pantry-item-service.ts     # Read pantry for soft ranking
├── db/
│   ├── schema.ts                  # No new tables required for v1
│   └── …
├── api/
│   ├── app.ts                     # Mount generate route (or extend weekly-plans)
│   └── routes/
│       ├── weekly-plans.ts        # Reject status path uses suggestion engine
│       └── generate-weekly-meals.ts  # POST generate
└── index.ts

tests/
├── contract/
│   └── generate-weekly-meals.contract.test.ts
├── integration/
│   └── generate-weekly-meals.integration.test.ts
└── unit/
    └── meal-suggestion.test.ts
```

**Structure Decision**: Continue the single-project layout from `001`–`007`. Add
`MealSuggestionEngine` as `meal-suggestion-service.ts` + pure domain helpers in
`meal-suggestion.ts`, rather than folding ranking into WeeklyPlanService.
WeeklyPlan remains the durable store; generation and reject→alternative are
workflow writers into that store. Update `007` reject status behavior so
`status: rejected` triggers automatic alternative (clarification).

## Complexity Tracking

> No constitution violations requiring justification.
