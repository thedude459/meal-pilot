# Implementation Plan: Meal Suggestion Engine

**Branch**: `011-meal-suggestion-engine` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-meal-suggestion-engine/spec.md`

## Summary

Establish constitution **MealSuggestionEngine** as a dedicated Speckit service
with bounded ownership of domain suggestion logic (`meal-suggestion.ts`) and the
service facade (`meal-suggestion-service.ts`). Behavior is **locked** to
GenerateWeeklyMeals (`008`): library-only hard filters, soft scores, rotation
window (target week + prior 2 weeks), rotation soft-relax, and deterministic
tie-break. The engine remains **internal**—organizers reach it only via
`POST /weekly-plans/generate` and reject→alternative on slot status. Delivery
is align/extract + dedicated tests (no intentional ranking changes, no new
HTTP surface, no from-scratch re-implementation). AI hybrid, nutrition, and
budget remain deferred (not waived).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Hono (existing HTTP consumers from `008`), Zod
(validation on those routes), Drizzle ORM + better-sqlite3 (read preferences,
recipes, pantry, plans), Vitest (tests)

**Storage**: SQLite — no new tables. Engine reads `family_members` / preference
profiles, `recipes`, `pantry_items`, and recent `weekly_plans` / `meal_slots`
for rotation. Durable writes remain WeeklyPlan slot assign/replace owned by
`007`/`008` orchestration through the existing `MealSuggestionService`
facade—not a second write path.

**Testing**: Vitest for unit (phrase/token match, dietary hard filter, soft
score weights, rotation soft-relax, greedy assign, alternative pick,
determinism), integration (household isolation via generate/reject consumers,
zero-members refuse), and contract (service contract YAML + existing `008`
generate/reject OpenAPI still authoritative for HTTP). Quickstart smoke reuses
the `008` generate + reject path to prove engine ownership.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); engine is
in-process; future organizer UI continues to call `008` HTTP endpoints

**Project Type**: Single-project modular domain service + HTTP API (engine is
internal module; HTTP remains workflow routes from `008`)

**Performance Goals**: Organizer generate → open plan under 2 minutes (SC-007)
via existing workflow — validated manually in quickstart (T027), not by an
automated load harness. Engine filter/rank for ≤500 recipes / ≤7 days should
complete in a few seconds locally as a stretch goal only; no timed CI gate in
`011` tasks.

**Constraints**: Lock `008` behavior—no intentional ranking/filter changes;
internal-only (no standalone suggest HTTP); hard dietary + dislike exclusions
never relax; rotation soft-relax only; rotation window = target Monday + prior
14 days; likes/pantry/timing/cuisine soft scores with deterministic
`recipeId` ascending tie-break; zero FamilyMembers → refuse
(`GENERATION_NO_PREFERENCES`); no AI Recipe creation; no grocery/pantry
mutation; no budget/nutrition scoring; business logic only in Speckit-owned
domain/service modules

**Scale/Scope**: 1 household (v1 default), ≤500 recipes, ≤104 weekly plans, 7
day slots; delivery = bounded ownership + dedicated tests; no new API modes;
RecipeHybridEngine / nutrition / budget out of delivery scope

**Follow-on features** (constitution — deferred, not waived):
- Hybrid AI recipe creation via `RecipeHybridEngine` (shared schema + dietary
  validation)
- Nutrition-oriented scoring when Recipe nutrition metadata exists
- Budget-aware filtering

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: PASS — hard exclusions for dietary
  restrictions and dislikes; likes soft-rank only; no silent overrides (locked
  to `008`).
- **Balanced Weekly Planning**: PASS — soft variety/rotation, cuisine-tag
  diversity, timing proxy via prep+cook minutes; nutrition deferred (not
  waived); budget deferred (not waived).
- **Automatic Grocery Generation**: N/A for delivery — engine does not build
  grocery lists; approved slots remain BuildGroceryList input.
- **Pantry-Aware Inventory**: PASS for soft ranking only — pantry boosts score;
  does not hard-block meals or mutate pantry; grocery subtraction remains
  BuildGroceryList.
- **Hybrid Recipe Sourcing**: PASS for library-only — AI path **deferred, not
  waived**; non-AI suggestion is deterministic; follow-on `RecipeHybridEngine`
  still mandatory.
- **Speckit-Driven Modularity**: PASS — this feature is the dedicated Speckit
  service contract for `MealSuggestionEngine`; domain + service facade owned
  here; GenerateWeeklyMeals (`008`) remains the workflow consumer; HTTP
  transport-only on existing routes.
- **Extensibility**: PASS — declares purpose (preference-safe suggest/rank/
  alternative) and dependencies (Recipe, PreferenceProfile, FamilyMember,
  PantryItem, WeeklyPlan); does not break GenerateWeeklyMeals, BuildGroceryList,
  or UpdatePantry contracts.

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required. Design
locks `008` scoring/filter/rotation rules into this service Speckit ownership,
documents an internal service contract (no new HTTP paths), and keeps workflow
persistence on existing generate/reject consumers.

## Project Structure

### Documentation (this feature)

```text
specs/011-meal-suggestion-engine/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── meal-suggestion-engine.service.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── meal-suggestion.ts         # OWNED: match/filter/rank/assign/alternative
│   │                              # pure functions (locked 008 behavior)
│   ├── weekly-plan.ts             # Reuse Monday/day/status helpers
│   ├── preference-profile.ts      # Reuse effective likes/dislikes/restrictions
│   ├── recipe.ts                  # Reuse Recipe shape + timing fields
│   ├── errors.ts                  # Reuse GENERATION_NO_PREFERENCES /
│   │                              # VALIDATION_ERROR (no new codes required)
│   └── …
├── services/
│   ├── meal-suggestion-service.ts # OWNED: MealSuggestionEngine facade —
│   │                              # load context, call domain, persist via
│   │                              # WeeklyPlanService (generate + reject alt)
│   ├── weekly-plan-service.ts     # Consumer dependency (assign/status)
│   ├── recipe-service.ts          # Read library for candidates
│   ├── family-member-service.ts   # Read members + preference profiles
│   └── pantry-item-service.ts     # Read pantry for soft ranking
├── api/
│   └── routes/
│       ├── generate-weekly-meals.ts  # Existing 008 consumer (no new routes)
│       └── weekly-plans.ts           # Reject path uses suggestion service
└── …

tests/
├── contract/
│   └── meal-suggestion-engine.contract.test.ts  # Service contract assertions
├── integration/
│   └── meal-suggestion-engine.integration.test.ts
└── unit/
    └── meal-suggestion.test.ts      # OWNED / extended under this feature
```

**Structure Decision**: Continue the single-project layout. This feature does
**not** add new HTTP routes. It claims Speckit ownership of
`src/domain/meal-suggestion.ts` and `src/services/meal-suggestion-service.ts`,
aligns module boundaries/comments/exports to the service contract, and adds
dedicated contract + integration tests attributable to `011` while preserving
locked `008` behavior. GenerateWeeklyMeals remains the organizer-facing
workflow.

**Naming**: Constitution / Speckit service name is **MealSuggestionEngine**.
Implementation alias: MealSuggestionEngine ≡ domain module
`meal-suggestion.ts` + facade class `MealSuggestionService` in
`meal-suggestion-service.ts`.

## Complexity Tracking

> No constitution violations requiring justification.
