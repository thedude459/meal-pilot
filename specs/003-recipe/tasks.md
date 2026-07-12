# Tasks: Recipes

**Input**: Design documents from `/specs/003-recipe/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — `plan.md` scopes Vitest unit/integration/contract suites for recipe CRUD, catalogs, and limits

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing stack and reserve recipe module / test layout

- [x] T001 Verify project layout (`src/domain/`, `src/services/`, `src/api/`, `src/db/`, `tests/{unit,integration,contract}/`) matches `specs/003-recipe/plan.md` and create any missing recipe-related directories
- [x] T002 [P] Confirm npm scripts (`dev`, `db:migrate`, `test`) and Vitest config in `package.json` / `vitest.config.ts` support new recipe suites without config changes (adjust only if drift found)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, unit catalog, error codes, and recipe domain normalization shared by all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add `UNKNOWN_UNIT`, `RECIPE_LIMIT`, and `RECIPE_LIBRARY_FULL` to `ErrorCode` plus `unknownUnitError` / `recipeLimitError` / `recipeLibraryFullError` helpers (`RECIPE_LIMIT` → 400, `RECIPE_LIBRARY_FULL` → 409) in `src/domain/errors.ts`
- [x] T004 [P] Implement predefined unit catalog (`listIngredientUnits`, `isKnownIngredientUnit`) with ids/labels/kinds from `specs/003-recipe/research.md` §3 in `src/domain/ingredient-units.ts`
- [x] T005 [P] Add `recipes` table to Drizzle schema in `src/db/schema.ts` per `specs/003-recipe/data-model.md` (household_id, title, JSON columns for ingredients/steps/cuisine/dietary tags, source, timestamps)
- [x] T006 Create SQLite migration `src/db/migrations/0002_recipes.sql` for the `recipes` table and ensure `runMigrations` in `src/db/client.ts` / `src/db/migrate.ts` applies it
- [x] T007 Implement shared Recipe domain types, constants (title ≤120, ingredient name ≤80, step ≤2000, ingredient/step/tag/library limits, quantity decimal places), `normalizeRecipeInput`, and `assertRecipeValid` (force `source=curated`, unit + dietary catalog checks, dietary ID first-seen dedupe, cuisine tag blank-drop + case-insensitive collapse) in `src/domain/recipe.ts`
- [x] T008 Confirm dietary attribute IDs reuse `isKnownDietaryRestriction` from `src/domain/dietary-restrictions.ts` (no separate recipe dietary catalog)

**Checkpoint**: Foundation ready — schema, catalogs, and recipe validation available for story work

---

## Phase 3: User Story 1 - Add a curated recipe (Priority: P1) 🎯 MVP

**Goal**: Organizer can create a curated recipe with title, measurable ingredients (free-text name, positive decimal quantity, catalog unit), ordered steps, optional metadata, and dietary tags; invalid creates leave the library unchanged.

**Independent Test**: POST a recipe with title, ≥1 ingredient, ≥1 step → reopen shows persisted fields with `source=curated`; unknown unit → `UNKNOWN_UNIT`; unknown dietary id → `UNKNOWN_RESTRICTION`; blank title/ingredients/steps → rejected with no row created; at 500 recipes, next create → `RECIPE_LIBRARY_FULL` 409.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Unit tests for normalize/validate (decimals, limits, dietary dedupe, cuisine collapse, blank rejection, curated source) in `tests/unit/recipe.test.ts`
- [x] T010 [P] [US1] Unit tests for unit catalog membership in `tests/unit/ingredient-units.test.ts`
- [x] T011 [P] [US1] Integration tests for `createRecipe` success, unknown unit, unknown dietary tag, validation failure (no row), and library full: with 500 existing recipes, create #501 returns `RECIPE_LIBRARY_FULL` / HTTP 409 and leaves count at 500 in `tests/integration/recipe.integration.test.ts`
- [x] T012 [P] [US1] Contract tests for `POST /recipes` per `specs/003-recipe/contracts/recipes.openapi.yaml` in `tests/contract/recipes.contract.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Implement `RecipeService.createRecipe` in `src/services/recipe-service.ts` (normalize + validate, enforce ≤500 with `recipeLibraryFullError`, persist with `source=curated`, default-scoped to `DEFAULT_HOUSEHOLD_ID` but accept injectable `householdId` for isolation tests)
- [x] T014 [US1] Add Zod transport-only request schemas and `POST /recipes` in `src/api/routes/recipes.ts` mapping domain errors via shared/error mapping pattern from `src/api/routes/family-members.ts`
- [x] T015 [US1] Mount recipe routes in `src/api/app.ts` with a `RecipeService` instance (extend `onError` mapping for `UNKNOWN_UNIT` / `RECIPE_LIMIT` → 400 and `RECIPE_LIBRARY_FULL` → 409)
- [x] T016 [US1] Ensure successful create returns `201` with full shared Recipe body including `source: curated` in `src/api/routes/recipes.ts`

**Checkpoint**: US1 MVP — curated recipe create works end-to-end

---

## Phase 4: User Story 2 - Browse and view recipes (Priority: P2)

**Goal**: Organizer can list the household library and open full recipe detail; empty library is valid; unit catalog is listable.

**Independent Test**: With ≥2 seeded recipes, GET list shows distinguishable entries (including duplicate titles); GET detail matches saved ingredients/steps/order/source; empty DB returns empty `items`; GET units returns catalog id+label+kind.

### Tests for User Story 2

- [x] T017 [US2] Contract tests for `GET /recipes`, `GET /recipes/{recipeId}`, and `GET /ingredient-units` in `tests/contract/recipes.contract.test.ts` (append; do not parallel with US1 contract authors)
- [x] T018 [US2] Integration tests for list (including empty), get detail, duplicate-title distinguishability, and unit catalog listing in `tests/integration/recipe.integration.test.ts` (append; do not parallel with US1 integration authors)

### Implementation for User Story 2

- [x] T019 [US2] Implement `listRecipes` and `getRecipe` on `src/services/recipe-service.ts` returning summaries (`id`, `title`, `source`, `servings`, `updatedAt`) and full Recipe detail scoped to household
- [x] T020 [US2] Implement `GET /recipes`, `GET /recipes/{recipeId}`, and `GET /ingredient-units` in `src/api/routes/recipes.ts` per `specs/003-recipe/contracts/recipes.openapi.yaml`
- [x] T021 [US2] Ensure list response includes `maxRecipes: 500` and `404` for missing recipe ids in `src/api/routes/recipes.ts`

**Checkpoint**: US1 + US2 — create, list, view, and unit catalog work independently

---

## Phase 5: User Story 3 - Edit or remove a recipe (Priority: P3)

**Goal**: Organizer can full-replace a recipe (last-write-wins) or permanently delete after client confirmation; invalid replace leaves prior row unchanged; cancelled delete is a no-call (API delete is permanent).

**Independent Test**: PUT changes title/ingredient → reopen shows only new values; invalid PUT → prior unchanged; DELETE → absent from list; second DELETE → `404`.

### Tests for User Story 3

- [x] T022 [US3] Contract tests for `PUT /recipes/{recipeId}` and `DELETE /recipes/{recipeId}` in `tests/contract/recipes.contract.test.ts` (append; do not parallel with US1/US2 contract authors)
- [x] T023 [US3] Integration tests for replace success, invalid replace leaves prior unchanged, permanent delete, and delete-not-found in `tests/integration/recipe.integration.test.ts` (append; do not parallel with US1/US2 integration authors)

### Implementation for User Story 3

- [x] T024 [US3] Implement `replaceRecipe` (full replace, keep `source=curated`, last successful write wins) and `deleteRecipe` (permanent) on `src/services/recipe-service.ts`
- [x] T025 [US3] Implement `PUT /recipes/{recipeId}` and `DELETE /recipes/{recipeId}` (`204` on success) in `src/api/routes/recipes.ts`
- [x] T026 [US3] Confirm replace preserves ingredient and instruction order after normalization (SC-007) in `src/domain/recipe.ts` / `src/services/recipe-service.ts`

**Checkpoint**: US1–US3 — full curated CRUD independently functional

---

## Phase 6: User Story 4 - Shared schema readiness for hybrid sourcing (Priority: P4)

**Goal**: Every persisted/returned recipe exposes the shared hybrid schema with explicit `source`; curated writes cannot become `ai`; dietary attribute ids remain the PreferenceProfile catalog for consumers; AI generation endpoints are not offered.

**Independent Test**: Created/replaced recipes always return `source: curated`; request body `source: ai` is ignored/overridden to curated; response always includes title, ingredients, instructionSteps, cuisineTags, dietaryAttributeIds, source; no AI-generate route exists under `/recipes`.

### Tests for User Story 4

- [x] T027 [P] [US4] Unit tests asserting normalize forces `source=curated` even when input requests `ai` in `tests/unit/recipe.test.ts` (append dedicated cases; coordinate if US1 unit author still active)
- [x] T028 [US4] Contract/integration assertions that Recipe responses always include shared schema fields + `source`, and that no AI generation path is registered, in `tests/contract/recipes.contract.test.ts` and `tests/integration/recipe.integration.test.ts` (append; do not parallel with earlier authors on those files)
- [x] T030 [US4] Integration test: two `RecipeService` instances (or constructor `householdId` overrides) prove recipes created in household A never appear in list/get for household B (FR-012 / SC-006) in `tests/integration/recipe.integration.test.ts` (append; do not parallel with earlier authors on that file)

### Implementation for User Story 4

- [x] T029 [US4] Harden create/replace paths in `src/domain/recipe.ts` and `src/services/recipe-service.ts` so client-supplied `source` cannot persist as `ai`
- [x] T031 [US4] Verify dietary tags on saved recipes remain PreferenceProfile catalog IDs (reuse `src/domain/dietary-restrictions.ts`) with no recipe-only catalog module introduced; contract responses remain the FR-013 consumer surface (no separate doc-only task)

**Checkpoint**: All four user stories independently functional; hybrid schema contract locked for future AI emitters; household isolation verified at service layer

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and operator readiness

- [x] T032 [P] Update root `README.md` with Recipes feature pointer and link to `specs/003-recipe/quickstart.md`; point current plan to `specs/003-recipe/plan.md`
- [x] T033 Validate quickstart smoke flows (units, create, list, get, replace, unknown unit/dietary, delete, restart persistence) per `specs/003-recipe/quickstart.md`
- [x] T034 [P] Run full `npm test` and fix any regressions in recipe, preference, or family-member suites
- [x] T035 Confirm out-of-scope boundaries: no AI generate route, no WeeklyPlan/grocery/pantry coupling in `src/api/routes/recipes.ts` / `src/services/recipe-service.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately (builds on `001`/`002`)
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; uses created recipes from US1 for demos but is independently testable with seeded rows
- **User Story 3 (Phase 5)**: Depends on Foundational; needs existing recipe rows (seed in tests)
- **User Story 4 (Phase 6)**: Depends on Foundational; hardens create/replace/response contracts and verifies FR-012 isolation via injectable `householdId`
- **Polish (Phase 7)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on US2–US4
- **User Story 2 (P2)**: After Foundational — independently testable with seeded recipes
- **User Story 3 (P3)**: After Foundational — independently testable with seeded recipes
- **User Story 4 (P4)**: After Foundational — independently testable via domain + response assertions; practically follows US1 create path

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Domain/service before endpoints
- Story complete before moving to next priority (or parallelize if staffed)

### Parallel Opportunities

- T001–T002 setup can proceed together
- T003, T004, T005 are [P] within Foundational (different files); T006 depends on T005; T007 depends on T003/T004; T008 can follow T007
- T009–T012 US1 tests can run in parallel (different files)
- T017/T018/T022/T023/T028/T030 append shared contract/integration files — **not** parallel with each other or with T011/T012 authors
- T027 may append `recipe.test.ts` — coordinate with T009
- After Foundational, US1/US2/US3 can proceed in parallel if capacity allows (watch shared files: `recipe-service.ts`, `recipes.ts`, `app.ts`)

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Unit tests in tests/unit/recipe.test.ts"
Task: "Unit tests in tests/unit/ingredient-units.test.ts"
Task: "Integration tests in tests/integration/recipe.integration.test.ts"
Task: "Contract tests for POST /recipes in tests/contract/recipes.contract.test.ts"

# Then implement sequentially (shared service/route files):
Task: "RecipeService.createRecipe in src/services/recipe-service.ts"
Task: "POST /recipes in src/api/routes/recipes.ts"
Task: "Mount routes in src/api/app.ts"
```

---

## Parallel Example: User Story 2

```bash
# After US1 contract/integration authors finish (shared files):
Task: "Contract tests for GET list/detail/units (append)"
Task: "Integration tests for list/get/units (append)"

# Implementation:
Task: "listRecipes + getRecipe in src/services/recipe-service.ts"
Task: "GET endpoints in src/api/routes/recipes.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Curated create + validation independently
5. Demo via POST/GET if list/get already stubbed, or proceed to US2 for browse

### Incremental Delivery

1. Setup + Foundational → schema, catalogs, normalize ready
2. US1 → create curated recipes (MVP)
3. US2 → list/view + unit catalog
4. US3 → replace + permanent delete
5. US4 → hybrid schema / source hardening
6. Polish → quickstart + README + full test run

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2 (coordinate on `recipes.ts` / `recipe-service.ts`)
   - Developer C: User Story 3 (coordinate on same shared files)
   - Developer D: User Story 4 assertions after create/replace paths exist
3. Merge carefully around `src/api/routes/recipes.ts`, `src/services/recipe-service.ts`, and `src/api/app.ts`

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Do not implement AI generation, WeeklyPlan linking, grocery merge, or pantry updates
- Do not add p95/sub-200ms latency gates in this feature (plan stretch target only — SC-002 is a manual UX outcome, not a load harness)
- Field limits → `RECIPE_LIMIT` (400); library at 500 → `RECIPE_LIBRARY_FULL` (409)
- Dietary tags MUST reuse PreferenceProfile catalog IDs
- Duplicate titles are allowed; identity is UUID
- FR-013 consumer exposure is satisfied by contract Recipe responses (T028), not comment-only docs
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
