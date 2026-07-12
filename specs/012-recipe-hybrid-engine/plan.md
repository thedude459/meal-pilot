# Implementation Plan: Recipe Hybrid Engine

**Branch**: `012-recipe-hybrid-engine` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-recipe-hybrid-engine/spec.md`

## Summary

Deliver constitution **RecipeHybridEngine** as a dedicated Speckit internal
service: AI recipe generation + shared-schema validation + preference-safe
library acceptance, hybrid fill (up to N slots, ≤3 attempts each), ingredient
substitution (distinct AI variant by default; replace-in-place only for existing
AI recipes), and P3 optional seasonal/budget soft guidance. No new organizer-
facing HTTP surface and no GenerateWeeklyMeals orchestration wiring—callers
(tests today; planning workflows later) invoke the in-process service. Reuses
Recipe (`003`) schema/limits and MealSuggestionEngine (`011`) dietary/dislike
match rules. Non-AI validation/persistence remains deterministic; AI generation
is the only non-deterministic path, behind an injectable generator port.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Vitest (tests); Drizzle ORM + better-sqlite3 (recipe
library persistence via RecipeService extensions); existing domain modules
(`recipe.ts`, `meal-suggestion.ts` preference matchers, `errors.ts`). No new
HTTP framework surface. AI provider accessed only through an injectable
`RecipeAiGenerator` port (stub/fake in default tests; optional real adapter later).

**Storage**: SQLite — no new tables. Persists accepted AI recipes in existing
`recipes` rows with `source = 'ai'`. Reads FamilyMember preference profiles for
validation. Does not write WeeklyPlan, grocery, or pantry.

**Testing**: Vitest unit (normalize AI payload, preference gate, retry budget,
substitution modes, seasonal/budget tag guidance), integration (persist AI
recipe, library cap, household isolation, replace-in-place rules), contract
(service YAML operations). Generator port faked for deterministic suite;
optional live-provider smoke out of default CI.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); engine is
in-process; no new HTTP routes

**Project Type**: Single-project modular domain service + existing HTTP API
(engine internal; curated Recipe HTTP remains `003`)

**Performance Goals**: Hybrid fill for small shortfalls (1–3 recipes) completes
within one caller attempt cycle with clear shortfall reporting (SC-006)—validated
in quickstart/integration, not a timed CI load gate. Stretch: local fill of ≤3
slots in a few seconds with stub generator.

**Constraints**: Internal service only; no organizer generate/substitute UI; no
GenerateWeeklyMeals auto-wire; hard dietary + dislike never relax; ≤3 generation
attempts per requested slot; library cap 500; curated replace-in-place forbidden;
shared schema with `003`; reuse `011` match rules; AI generation non-deterministic
only behind port; validation/persistence deterministic; no grocery/pantry/plan
ownership

**Scale/Scope**: 1 household (v1 default), ≤500 recipes; delivery = generate +
hybrid fill + validate/accept + substitution + P3 seasonal/budget soft guidance
+ dedicated tests; GenerateWeeklyMeals wiring deferred (not waived)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: PASS — AI acceptance and substitution require
  hard dietary + dislike validation before library write; soft seasonal/budget
  never override hard rules.
- **Balanced Weekly Planning**: N/A for orchestration — this feature does not
  assign week slots; it supplies preference-safe AI library recipes for later
  planning consumers. Seasonal/budget soft guidance supported as P3.
- **Automatic Grocery Generation**: N/A for delivery — does not build grocery
  lists; accepted Recipes remain BuildGroceryList inputs.
- **Pantry-Aware Inventory**: N/A for delivery — does not mutate pantry or
  hard-block on stock.
- **Hybrid Recipe Sourcing**: PASS — this feature is the mandatory AI path;
  shared schema with curated; dietary validation before acceptance; non-AI
  paths remain deterministic.
- **Speckit-Driven Modularity**: PASS — dedicated Speckit service contract for
  `RecipeHybridEngine`; domain + service facade owned here; curated CRUD stays
  `003`; suggestion ranking stays `011`.
- **Extensibility**: PASS — declares purpose (AI create/fill/substitute/
  soft filters) and dependencies (Recipe, PreferenceProfile, FamilyMember,
  MealSuggestion matchers); does not break GenerateWeeklyMeals, BuildGroceryList,
  or UpdatePantry contracts (no orchestration change).

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required. Design
documents an internal service contract (no new HTTP), an injectable AI generator
port, AI persistence via existing `recipes` with `source=ai`, and reuse of
`003`/`011` validation rules.

## Project Structure

### Documentation (this feature)

```text
specs/012-recipe-hybrid-engine/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── recipe-hybrid-engine.service.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── recipe.ts                    # extend: AI normalize (source=ai), keep curated force
│   ├── meal-suggestion.ts           # reuse preference match/filter helpers
│   ├── recipe-hybrid.ts             # NEW: request/result types, accept gate, retry, substitute, soft tags
│   └── errors.ts                    # extend hybrid error codes as needed
├── services/
│   ├── recipe-service.ts            # extend: createAiRecipe / updateAiRecipe (preserve source)
│   └── recipe-hybrid-service.ts     # NEW: RecipeHybridEngine facade
└── (no new api/routes — internal only)

tests/
├── unit/
│   └── recipe-hybrid.test.ts
├── integration/
│   └── recipe-hybrid-engine.integration.test.ts
└── contract/
    └── recipe-hybrid-engine.contract.test.ts
```

**Structure Decision**: Same single-project layout as `011` — domain module +
service facade + Vitest unit/integration/contract. No new HTTP routes. Recipe
persistence stays on existing SQLite `recipes` table via RecipeService
extensions that allow `source=ai` (curated `normalizeRecipeInput` remains
force-curated).

**Constitution “suggest” wording**: The Recipe Hybrid Engine behavioral rule
that the engine MUST “suggest recipes based on preferences” is satisfied here by
**preference-gated AI generation and library acceptance**. Week-level candidate
ranking/assignment remains owned by MealSuggestionEngine (`011`); this feature
does not re-implement suggest/rank. No constitution waiver—modular service split.

## Complexity Tracking

> None — no constitution violations requiring justification.
