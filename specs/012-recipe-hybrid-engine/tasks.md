# Tasks: Recipe Hybrid Engine

**Input**: Design documents from `/specs/012-recipe-hybrid-engine/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — `plan.md` / `research.md` require dedicated Vitest unit,
integration, and service-contract suites; `spec.md` Independent Tests and
SC-001–SC-006 are the acceptance bar. Use injectable stub `RecipeAiGenerator`
(no live provider in default CI).

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm stack and reserve RecipeHybridEngine module / test layout

- [x] T001 Verify project layout per `specs/012-recipe-hybrid-engine/plan.md`
  and create placeholder paths for `src/domain/recipe-hybrid.ts`,
  `src/services/recipe-hybrid-service.ts`, and
  `tests/{unit,integration,contract}/` hybrid test files (dirs only if missing)
- [x] T002 [P] Confirm npm scripts (`dev`, `db:migrate`, `test`) and Vitest
  config in `package.json` / `vitest.config.ts` support new recipe-hybrid
  suites without config changes (adjust only if drift found)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Error codes, AI normalize/persist primitives, generator port types,
and service shell — blocking all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add hybrid domain error helpers
  (`HYBRID_GENERATION_FAILED`, `HYBRID_REPLACE_CURATED_FORBIDDEN`, and any
  shared reason constants) in `src/domain/errors.ts` and map them in
  `src/api/app.ts` if DomainError HTTP mapping is centralized there
- [x] T004 [P] Add `normalizeAiRecipeInput` (force `source: "ai"`, reuse curated
  structural limits/catalogs) in `src/domain/recipe.ts` without changing
  `normalizeRecipeInput` curated force behavior
- [x] T005 [P] Extend `RecipeService` with `createAiRecipe` / `updateAiRecipe`
  (preserve `source: "ai"`, enforce library cap via existing
  `recipeLibraryFullError`) in `src/services/recipe-service.ts`
- [x] T006 Define `RecipeAiGenerator` port, `HybridGenerationRequest`,
  `HybridGenerationResult`, `SubstitutionRequest` types, and
  `MAX_GENERATION_ATTEMPTS_PER_SLOT = 3` in `src/domain/recipe-hybrid.ts`
- [x] T007 Create `RecipeHybridService` shell (ctor: db, householdId, injectable
  `generator`) with ownership JSDoc (RecipeHybridEngine, internal-only, no
  GenerateWeeklyMeals auto-wire, no new HTTP) in
  `src/services/recipe-hybrid-service.ts`
- [x] T008 [P] Verify no new hybrid/generate HTTP routes exist under
  `src/api/routes/` (`http.newPaths: []` per
  `specs/012-recipe-hybrid-engine/contracts/recipe-hybrid-engine.service.yaml`)

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 - Preference-safe AI recipes (Priority: P1) 🎯 MVP

**Goal**: Generate one preference-safe shared-schema AI recipe (≤3 attempts),
persist `source=ai`, reject unsafe/invalid candidates without library writes.

**Independent Test**: Prefs with hard restriction + dislike; stub generator
returns safe then unsafe candidates; accepted recipe is schema-valid `ai` and
preference-safe; unsafe never persisted.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Unit tests for `normalizeAiRecipeInput`, preference accept
  gate reusing `011` hard filters, ≤3-attempt retry discard, and empty
  prefs / zero-member aggregate (dietary hard-match vacuously OK; schema still
  required) in `tests/unit/recipe-hybrid.test.ts`
- [x] T010 [P] [US1] Integration tests for `generateRecipe` persist `source=ai`,
  unsafe/invalid candidates leave library unchanged, library-full refusal, and
  empty-preference household still accepts schema-valid AI recipes in
  `tests/integration/recipe-hybrid-engine.integration.test.ts`
- [x] T011 [P] [US1] Contract tests for `generateRecipe` operation / result
  envelope / `http.newPaths: []` per
  `specs/012-recipe-hybrid-engine/contracts/recipe-hybrid-engine.service.yaml`
  in `tests/contract/recipe-hybrid-engine.contract.test.ts`

### Implementation for User Story 1

- [x] T012 [US1] Implement preference accept helpers (wrap
  `aggregatePreferences` / `isRecipeHardSafe` / candidate mapping from
  `src/domain/meal-suggestion.ts`) and single-slot generate-with-retry in
  `src/domain/recipe-hybrid.ts`
- [x] T013 [US1] Implement `RecipeHybridService.generateRecipe` (load prefs,
  call generator port, normalize+gate, persist via `createAiRecipe`, return
  envelope) in `src/services/recipe-hybrid-service.ts`
- [x] T014 [US1] Ensure curated `RecipeService.createRecipe` /
  `normalizeRecipeInput` still force `source: "curated"` and cannot be used to
  write AI rows from hybrid paths in `src/services/recipe-service.ts` /
  `src/domain/recipe.ts`

**Checkpoint**: US1 MVP — preference-safe AI generate + persist works

---

## Phase 4: User Story 2 - Hybrid fill service (Priority: P1)

**Goal**: Callable `hybridFill({ count: N })` produces up to N AI recipes with
per-slot ≤3 attempts, partial success + unmet reasons, no GenerateWeeklyMeals
wiring.

**Independent Test**: `hybridFill({ count: 2 })` with stub → two AI recipes or
explicit unmet reasons; MealSuggestion hard filters still apply to new rows;
no changes to `src/api/routes/generate-weekly-meals.ts` orchestration.

### Tests for User Story 2

- [x] T015 [P] [US2] Unit tests for multi-slot fill loop, per-slot attempt
  budget, and shortfall aggregation in `tests/unit/recipe-hybrid.test.ts`
  (append; coordinate if US1 unit author still active)
- [x] T016 [US2] Integration tests for `hybridFill` partial success, retry
  exhaustion unmet reasons (no silent empty success), capacity mid-fill stop,
  and FR-013 first-class selection: persisted AI recipes appear in
  `RecipeService.listFullRecipes()` and pass `isRecipeHardSafe` under the same
  household prefs as curated candidates in
  `tests/integration/recipe-hybrid-engine.integration.test.ts` (append)
- [x] T017 [P] [US2] Contract tests for `hybridFill` input/output and failure
  reason enums per
  `specs/012-recipe-hybrid-engine/contracts/recipe-hybrid-engine.service.yaml`
  in `tests/contract/recipe-hybrid-engine.contract.test.ts` (append)

### Implementation for User Story 2

- [x] T018 [US2] Implement hybrid-fill domain orchestration (N slots, reuse
  single-slot retry, aggregate `HybridGenerationResult`) in
  `src/domain/recipe-hybrid.ts`
- [x] T019 [US2] Implement `RecipeHybridService.hybridFill` in
  `src/services/recipe-hybrid-service.ts`
- [x] T020 [US2] Confirm GenerateWeeklyMeals routes/services are untouched
  (no auto-call to hybrid fill) in `src/api/routes/generate-weekly-meals.ts`
  and `src/services/meal-suggestion-service.ts`

**Checkpoint**: US1 + US2 — generate and fill independently callable

---

## Phase 5: User Story 3 - Ingredient substitution (Priority: P2)

**Goal**: Substitute exactly one ingredient with a required structured
replacement → distinct AI variant by default; replace-in-place only for existing
AI recipes; curated replace-in-place forbidden. No free-text/generator
replacement path in v1.

**Independent Test**: Substitute on curated with structured replacement → new
`ai` row, curated unchanged; replace-in-place on curated →
`HYBRID_REPLACE_CURATED_FORBIDDEN`; replace-in-place on AI → same id updated,
still `ai`; missing `replacement` → `VALIDATION_ERROR`.

### Tests for User Story 3

- [x] T021 [P] [US3] Unit tests for single-ingredient structured replacement,
  distinct vs replace-in-place rules, missing/invalid `replacement` rejection,
  unknown ingredient rejection, and preference-unsafe substitute reject in
  `tests/unit/recipe-hybrid.test.ts` (append)
- [x] T022 [US3] Integration tests for curated distinct variant, curated
  replace forbidden, AI replace-in-place, required structured `replacement`,
  and unsafe substitute leaves original unchanged in
  `tests/integration/recipe-hybrid-engine.integration.test.ts` (append)
- [x] T023 [P] [US3] Contract tests for `substituteIngredient` modes/errors and
  required `replacement` object per
  `specs/012-recipe-hybrid-engine/contracts/recipe-hybrid-engine.service.yaml`
  in `tests/contract/recipe-hybrid-engine.contract.test.ts` (append)

### Implementation for User Story 3

- [x] T024 [US3] Implement substitution domain builders/gates (single
  ingredient name match, required structured replacement apply, mode checks,
  preference/schema gate) in `src/domain/recipe-hybrid.ts`
- [x] T025 [US3] Implement `RecipeHybridService.substituteIngredient` (require
  structured `replacement`; distinct → `createAiRecipe`; AI replace →
  `updateAiRecipe`; curated replace → `HYBRID_REPLACE_CURATED_FORBIDDEN`) in
  `src/services/recipe-hybrid-service.ts`

**Checkpoint**: US3 — substitution modes independently testable

---

## Phase 6: User Story 5 - Failure clarity, isolation, determinism (Priority: P2)

**Goal**: Clear failure reasons, household isolation, deterministic validation
for identical candidate+prefs payloads (generation remains non-deterministic).

**Independent Test**: Same candidate+prefs → identical accept/reject twice;
household B never sees A’s recipes/prefs; provider/validation failures return
high-level reasons with no partial invalid rows.

### Tests for User Story 5

- [x] T026 [P] [US5] Unit tests for deterministic validation on identical
  payloads and stable failure reason mapping in
  `tests/unit/recipe-hybrid.test.ts` (append)
- [x] T027 [US5] Integration tests for cross-household isolation and no partial
  invalid persists on generation failure in
  `tests/integration/recipe-hybrid-engine.integration.test.ts` (append)

### Implementation for User Story 5

- [x] T028 [US5] Harden `RecipeHybridService` failure envelopes (no throw for
  expected unmet fill slots; map provider errors to
  `HYBRID_GENERATION_FAILED`) and household-scoped service construction in
  `src/services/recipe-hybrid-service.ts`
- [x] T029 [US5] Confirm preference/schema gate functions are pure/deterministic
  in `src/domain/recipe-hybrid.ts` (fix only gaps from T026)

**Checkpoint**: US5 — isolation and failure semantics verified

---

## Phase 7: User Story 4 - Seasonal and budget soft guidance (Priority: P3)

**Goal**: Optional seasonal/budget guidance reflected in cuisine tags after
normalize; never overrides hard dietary/dislike gates; optional absence OK.

**Independent Test**: Generate with seasonal and with budget guidance in
separate runs → preference-safe `ai` recipes with guidance visible in
`cuisineTags`; unsafe candidate still rejected even if guidance present.

### Tests for User Story 4

- [x] T030 [P] [US4] Unit tests for soft-guidance → cuisine tag merge and
  hard-filter precedence over guidance in `tests/unit/recipe-hybrid.test.ts`
  (append)
- [x] T031 [US4] Integration tests for `generateRecipe` /
  `hybridFill` with seasonal and budget guidance tags persisted in
  `tests/integration/recipe-hybrid-engine.integration.test.ts` (append)
- [x] T032 [P] [US4] Contract tests asserting optional
  `seasonalGuidance` / `budgetGuidance` fields on generate/fill/substitute per
  `specs/012-recipe-hybrid-engine/contracts/recipe-hybrid-engine.service.yaml`
  in `tests/contract/recipe-hybrid-engine.contract.test.ts` (append)

### Implementation for User Story 4

- [x] T033 [US4] Implement `applySoftGuidanceTags` (merge seasonal/budget into
  cuisine tags via existing cuisine normalize rules) in
  `src/domain/recipe-hybrid.ts`
- [x] T034 [US4] Wire soft guidance through `generateRecipe`, `hybridFill`, and
  `substituteIngredient` request paths in
  `src/services/recipe-hybrid-service.ts` without relaxing hard gates

**Checkpoint**: All user stories independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Docs, smoke, and regression guardrails

- [x] T035 [P] Align `specs/012-recipe-hybrid-engine/quickstart.md` with final
  `RecipeHybridService` / stub generator API names if they drifted
- [x] T036 Run full Vitest suites for hybrid unit/integration/contract and fix
  regressions in `tests/unit/recipe-hybrid.test.ts`,
  `tests/integration/recipe-hybrid-engine.integration.test.ts`,
  `tests/contract/recipe-hybrid-engine.contract.test.ts`
- [x] T037 [P] Confirm curated recipe HTTP/tests still pass
  (`tests/unit/recipe.test.ts`, `tests/integration/recipe.integration.test.ts`)
  proving AI normalize path did not break curated force-`curated`
- [x] T038 Execute quickstart programmatic smoke from
  `specs/012-recipe-hybrid-engine/quickstart.md` (stub generator) and note
  results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — MVP
- **US2 (Phase 4)**: Depends on US1 generate/retry primitives
- **US3 (Phase 5)**: Depends on Foundational AI persist; ideally after US1 gate
- **US5 (Phase 6)**: Depends on US1/US2 service paths existing
- **US4 (Phase 7)**: Depends on generate/fill (and optionally substitute) paths
- **Polish (Phase 8)**: Depends on desired stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no story dependencies — MVP
- **US2 (P1)**: After US1 single-slot generate/retry
- **US3 (P2)**: After Foundational + US1 accept gate (can parallel US2 if staffed
  carefully on shared files)
- **US5 (P2)**: After US1 (and preferably US2) service methods exist
- **US4 (P3)**: After US1 generate path (preferably after US2/US3)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Domain helpers before service methods
- Story complete before moving to next priority when single-threaded

### Parallel Opportunities

- T001–T002 setup parallel where marked
- T003–T008 foundational: T004/T005/T008 parallel after T003/T006 sequencing as
  noted
- Per story: unit/contract tests marked [P] can run in parallel; integration
  often serial on same file
- After Foundational: US3 can start in parallel with US2 if different authors
  coordinate `recipe-hybrid.ts` / service edits

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Unit tests in tests/unit/recipe-hybrid.test.ts"
Task: "Integration tests in tests/integration/recipe-hybrid-engine.integration.test.ts"
Task: "Contract tests in tests/contract/recipe-hybrid-engine.contract.test.ts"

# Then implement domain + service sequentially:
Task: "Accept gate + retry in src/domain/recipe-hybrid.ts"
Task: "generateRecipe in src/services/recipe-hybrid-service.ts"
```

---

## Parallel Example: User Story 3

```bash
Task: "Unit substitution tests in tests/unit/recipe-hybrid.test.ts"
Task: "Contract substituteIngredient tests in tests/contract/recipe-hybrid-engine.contract.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Stub generate → preference-safe `ai` recipe persisted
5. Demo via programmatic service call (no HTTP)

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → MVP AI generate/accept
3. US2 → hybrid fill shortfall API
4. US3 → substitution modes
5. US5 → isolation/failure hardening
6. US4 → seasonal/budget soft guidance
7. Polish → quickstart + regression

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Dev A: US1 → US2
3. Dev B: US3 (after US1 gate exists) then US4
4. Either: US5 isolation/determinism pass
5. Integrate and run Phase 8

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Internal service only — do not add organizer HTTP or wire GenerateWeeklyMeals
- Stub `RecipeAiGenerator` for all default tests
- Reuse `011` hard-filter helpers; do not fork matcher semantics
- Curated CRUD ownership stays in `003` paths
- Commit after each task or logical group
- Avoid: live AI in CI, curated replace-in-place, schema forks for season/budget,
  multi-ingredient or free-text substitution in v1
