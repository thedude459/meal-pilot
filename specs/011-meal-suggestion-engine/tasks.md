# Tasks: Meal Suggestion Engine

**Input**: Design documents from `/specs/011-meal-suggestion-engine/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — `spec.md` FR-017 / SC-008 and `plan.md` require dedicated
Vitest unit, integration, and service-contract suites for hard filters, soft
ranking, rotation soft-relax, alternatives, determinism, and household isolation
(no intentional behavior change vs `008`)

**Verify/align done criteria**: For tasks worded “align”, “ensure”, “confirm”,
or “verify” on existing code: **Done when** (1) dedicated `011` tests for that
story pass, and (2) behavior matches the locked `008` research score/filter
table with **no score-weight or filter-rule edits**. Do not rewrite working
logic solely to satisfy red-green theater.

**TDD note for existing suites**: Where `tests/unit/meal-suggestion.test.ts` (or
related `008` suites) already cover a case, add new `011`-attributed assertions
only for gaps; skip forcing a failing test when the behavior is already green.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing stack and reserve MealSuggestionEngine ownership /
test layout under `011`

- [x] T001 Verify project layout (`src/domain/meal-suggestion.ts`,
  `src/services/meal-suggestion-service.ts`, `tests/{unit,integration,contract}/`)
  matches `specs/011-meal-suggestion-engine/plan.md` and create any missing
  directories for new `011` test files
- [x] T002 [P] Confirm npm scripts (`dev`, `db:migrate`, `test`) and Vitest
  config in `package.json` / `vitest.config.ts` support new meal-suggestion-engine
  suites without config changes (adjust only if drift found)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Claim Speckit ownership of the existing engine modules and align
exports/types to the internal service contract without changing ranking behavior

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add module ownership header comments documenting Speckit feature
  `011-meal-suggestion-engine` (behavior locked to `008`) at the top of
  `src/domain/meal-suggestion.ts` and `src/services/meal-suggestion-service.ts`
- [x] T004 [P] Align exported reason/mode constants and types
  (`GENERATION_MODES`, `UnfilledReason`, `AlternativeOutcome`,
  `GenerationReport`) in `src/domain/meal-suggestion.ts` with
  `specs/011-meal-suggestion-engine/contracts/meal-suggestion-engine.service.yaml`
  (rename only if contract mismatch; do not change score weights or filter
  logic) (Done: exports match contract enums; T010 can assert them)
- [x] T005 Document public facade operations `generateWeeklyMeals` and
  `rejectWithAlternative` (JSDoc referencing MealSuggestionEngine alias,
  internal-only exposure + `008` HTTP consumers) on `MealSuggestionService` in
  `src/services/meal-suggestion-service.ts`
- [x] T006 [P] Confirm `GENERATION_NO_PREFERENCES` / `VALIDATION_ERROR` /
  `WEEKLY_PLAN_LIBRARY_FULL` remain mapped in `src/domain/errors.ts` and
  `src/api/app.ts` (no new error codes required for `011`) (Done: codes present
  and mapped; no new codes added)
- [x] T007 Verify no new suggest-only HTTP route exists; generate + reject
  continue via `src/api/routes/generate-weekly-meals.ts` and
  `src/api/routes/weekly-plans.ts` only (document in a short comment on the
  service facade if helpful) (Done: `rg`/route inventory shows no new suggest
  path; contract `http.newPaths: []`)

**Checkpoint**: Ownership + contract alignment ready — story work can begin

---

## Phase 3: User Story 1 - Preference-safe meal candidates for the week (Priority: P1) 🎯 MVP

**Goal**: Engine hard-filters dietary restrictions + dislikes, soft-ranks with
locked `008` scores (likes, pantry, timing, cuisine, rotation window = target +
prior 14 days), and greedily assigns eligible days for week-fill consumers
without preference violations.

**Independent Test**: Seed members with restriction + dislike and safe/unsafe
recipes; run domain assign / `generateWeeklyMeals`; every filled day is
preference-safe and unsafe recipes never appear.

### Tests for User Story 1

> **NOTE**: Prefer adding gap assertions for `011` ownership. Force fail-first
> only when a required case is missing; do not break already-green coverage.

- [x] T008 [P] [US1] Extend unit tests for phrase/token dislike match, dietary
  hard filter (all restriction IDs required), empty/whitespace dislike ignored,
  likes/pantry/timing/cuisine/rotation scoring weights, rotation window
  (`rotationWindowStart`), greedy Mon→Sun assign, and soft-relax only when
  rotation empties the pool in `tests/unit/meal-suggestion.test.ts` per
  `specs/011-meal-suggestion-engine/research.md` (Done: all listed cases
  asserted; weights match research table)
- [x] T009 [P] [US1] Integration tests for preference-safe generate fill
  (unsafe recipes never slotted), partial coverage `NO_SAFE_CANDIDATES` report,
  and pantry soft-boost does not hard-block missing ingredients via
  `MealSuggestionService.generateWeeklyMeals` in
  `tests/integration/meal-suggestion-engine.integration.test.ts`
- [x] T010 [P] [US1] Contract tests asserting service-contract enums/operations
  (`fill-empty` / `regenerate-non-approved`, `NO_SAFE_CANDIDATES`,
  `generateWeeklyMeals` presence, `http.newPaths: []`) against
  `src/domain/meal-suggestion.ts` / `src/services/meal-suggestion-service.ts`
  per `specs/011-meal-suggestion-engine/contracts/meal-suggestion-engine.service.yaml`
  in `tests/contract/meal-suggestion-engine.contract.test.ts`

### Implementation for User Story 1

- [x] T011 [US1] Align hard-filter helpers (`matchesPhraseOrToken`,
  `isRecipeHardSafe`, `aggregatePreferences`, `toCandidateRecipe`) in
  `src/domain/meal-suggestion.ts` to locked `008` rules without intentional
  behavior change; fix only gaps revealed by T008 (Done: T008 green; no weight
  or matcher rule changes vs research)
- [x] T012 [US1] Align soft scoring + greedy assign (`scoreCandidate`,
  `pickBestCandidate`, `assignDaysGreedy`, `eligibleDays`,
  `buildGenerationReport`, `rotationWindowStart`) in
  `src/domain/meal-suggestion.ts` to locked weights/window/soft-relax; fix only
  gaps revealed by T008 (Done: T008 green; scores match research table)
- [x] T013 [US1] Ensure `MealSuggestionService.generateWeeklyMeals` in
  `src/services/meal-suggestion-service.ts` loads prefs/recipes/pantry/rotation
  context, refuses zero FamilyMembers with `GENERATION_NO_PREFERENCES`, and
  persists only via `WeeklyPlanService` (no direct SQL; no AI creates) (Done:
  T009 green; zero-members path still throws `GENERATION_NO_PREFERENCES`)
- [x] T014 [US1] Confirm week-fill HTTP consumer in
  `src/api/routes/generate-weekly-meals.ts` still delegates entirely to
  `MealSuggestionService` (no duplicated filter/rank logic in the route) (Done:
  route contains no ranking/filter helpers; only service call + transport)

**Checkpoint**: US1 MVP — preference-safe week candidates owned by
MealSuggestionEngine

---

## Phase 4: User Story 2 - Alternative after a rejected meal (Priority: P1)

**Goal**: Engine proposes one different preference-safe alternative for a day
(excluding current recipe), soft-relaxing rotation only when needed; returns
clear `NO_SAFE_ALTERNATIVE` when none remain.

**Independent Test**: Week with multiple safe recipes → reject day → different
safe pending recipe (or `applied: false` + `NO_SAFE_ALTERNATIVE`); hard filters
never violated after soft-relax.

### Tests for User Story 2

- [x] T015 [P] [US2] Unit tests for `pickAlternative` excluding current
  `recipeId`, rotation soft-relax retry, and empty result
  `NO_SAFE_ALTERNATIVE` semantics in `tests/unit/meal-suggestion.test.ts`
  (append; coordinate if US1 unit author still active)
- [x] T016 [US2] Integration tests for reject→alternative applied vs
  `NO_SAFE_ALTERNATIVE`, and hard-filter compliance after soft-relax, via
  `MealSuggestionService.rejectWithAlternative` in
  `tests/integration/meal-suggestion-engine.integration.test.ts` (append; do
  not parallel with US1 integration authors)
- [x] T017 [P] [US2] Contract tests for `rejectWithAlternative` /
  `AlternativeOutcome` (`applied: true` | `applied: false, reason:
  NO_SAFE_ALTERNATIVE`) per
  `specs/011-meal-suggestion-engine/contracts/meal-suggestion-engine.service.yaml`
  in `tests/contract/meal-suggestion-engine.contract.test.ts` (append;
  coordinate if US1 contract author still active)

### Implementation for User Story 2

- [x] T018 [US2] Align `pickAlternative` in `src/domain/meal-suggestion.ts` to
  locked exclude-current + rotation soft-relax rules; fix only gaps revealed by
  T015 (Done: T015 green; no ranking weight edits)
- [x] T019 [US2] Ensure `MealSuggestionService.rejectWithAlternative` in
  `src/services/meal-suggestion-service.ts` applies pending replacement on
  success and durable rejected + prior recipe on failure, without a separate
  suggest HTTP surface (Done: T016 green)
- [x] T020 [US2] Confirm reject status path in `src/api/routes/weekly-plans.ts`
  delegates alternative selection to `MealSuggestionService` (no duplicated
  ranking in the route) (Done: route has no ranking helpers; only service
  call + transport)

**Checkpoint**: US1 + US2 — week fill and reject alternatives independently
functional under engine ownership

---

## Phase 5: User Story 3 - Deterministic, household-scoped suggestions (Priority: P2)

**Goal**: Identical inputs yield identical ranked/assigned results; household A
never sees or depends on household B data; zero FamilyMembers refuses
preference-based suggestion.

**Independent Test**: Run assign/generate twice with identical fixtures → same
ordered picks; second household’s library/prefs do not appear in A’s results;
zero members → `GENERATION_NO_PREFERENCES`.

### Tests for User Story 3

- [x] T021 [P] [US3] Unit tests for deterministic tie-break (`recipeId`
  ascending) and identical-input identical-output for
  `scoreCandidate` / `assignDaysGreedy` in `tests/unit/meal-suggestion.test.ts`
  (append; coordinate if unit author still active)
- [x] T022 [US3] Integration tests for household isolation (injectable
  `householdId` on `MealSuggestionService`) and zero-members
  `GENERATION_NO_PREFERENCES` in
  `tests/integration/meal-suggestion-engine.integration.test.ts` (append; do
  not parallel with earlier integration authors)
- [x] T023 [P] [US3] Contract tests asserting zero-members maps to
  `GENERATION_NO_PREFERENCES` and service remains internal
  (`http.newPaths: []`) in
  `tests/contract/meal-suggestion-engine.contract.test.ts` (append; coordinate
  if contract author still active)

### Implementation for User Story 3

- [x] T024 [US3] Verify/preserve deterministic ordering and household-scoped
  reads in `src/domain/meal-suggestion.ts` /
  `src/services/meal-suggestion-service.ts` (injectable `householdId` already
  present — fix only gaps revealed by T021–T022) (Done: T021–T022 green; no
  non-deterministic APIs introduced)
- [x] T025 [US3] Confirm out-of-scope boundaries remain intact: no AI Recipe
  creation, no grocery/pantry mutation, no budget/nutrition scoring, no
  standalone suggest route in `src/services/meal-suggestion-service.ts` /
  `src/api/routes/generate-weekly-meals.ts` / `src/api/routes/weekly-plans.ts`
  (Done: code review checklist checked; T010/T023 `http.newPaths: []` still
  holds)

**Checkpoint**: All three user stories independently functional under bounded
engine ownership

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and operator readiness

- [x] T026 [P] Update root `README.md` with Meal Suggestion Engine feature
  pointer and link to `specs/011-meal-suggestion-engine/quickstart.md`; note
  internal service ownership (behavior locked to `008`); confirm agent plan
  pointer is `specs/011-meal-suggestion-engine/plan.md` in
  `.cursor/rules/specify-rules.mdc`
- [x] T027 Validate quickstart smoke flows (seed prefs + safe/unsafe recipes,
  generate, reject→alternative) per
  `specs/011-meal-suggestion-engine/quickstart.md` — **manual SC-007 check**:
  organizer generate → open plan completes in under 2 minutes on a local seeded
  household; record pass/fail in the PR or commit notes (no automated timer)
- [x] T028 [P] Run full `npm test` and fix any regressions in meal-suggestion,
  generate-weekly-meals, weekly-plan, or related suites
- [x] T029 Confirm GenerateWeeklyMeals (`008`) HTTP behavior remains unchanged
  aside from clearer engine ownership (no intentional ranking drift) by
  spot-checking existing
  `tests/integration/generate-weekly-meals.integration.test.ts` still passes
  (Done: that suite green **and** no diff to soft-score weights / hard-filter
  rules / rotation window in `src/domain/meal-suggestion.ts` vs locked `008`
  research table)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately (builds on `001`–`010`)
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; shares domain module with
  US1 (serialize edits to `meal-suggestion.ts` / shared test files)
- **User Story 3 (Phase 5)**: Depends on Foundational; isolation tests build on
  service facade used by US1/US2
- **Polish (Phase 6)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on other stories — MVP
- **User Story 2 (P1)**: After Foundational; same domain file as US1 — prefer
  sequential ownership of `meal-suggestion.ts` when staffing is serial
- **User Story 3 (P2)**: After Foundational; integration isolation can follow
  US1 service path

### Within Each User Story

- Prefer gap assertions for `011`; fail-first only when a required case is missing
- Domain alignment before service confirmation
- No new HTTP endpoints
- Verify/align tasks are done when story tests pass and locked `008` rules are unchanged
- Story complete before moving to next priority when staffing is serial

### Parallel Opportunities

- T001 then T002 [P] in Setup
- T004∥T006 early in Foundational; T003/T005/T007 sequential on service/domain
  docs
- US1 tests T008–T010 [P] together before implementation
- US2 unit T015∥ contract T017 while US1 implementation finishes (careful on
  shared test files)
- US3 unit T021∥ contract T023 with care on shared files
- Polish T026∥T028 after stories complete

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Extend unit tests for phrase/token dislike match... in tests/unit/meal-suggestion.test.ts"
Task: "Integration tests for preference-safe generate fill... in tests/integration/meal-suggestion-engine.integration.test.ts"
Task: "Contract tests asserting service-contract enums... in tests/contract/meal-suggestion-engine.contract.test.ts"

# Then align domain → service → confirm HTTP consumer (T011–T014)
```

---

## Parallel Example: User Story 2

```bash
# Unit + contract can proceed in parallel; integration appends serially:
Task: "Unit tests for pickAlternative... in tests/unit/meal-suggestion.test.ts"
Task: "Contract tests for rejectWithAlternative... in tests/contract/meal-suggestion-engine.contract.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Preference-safe candidates independently
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational → Ownership foundation ready
2. Add US1 week candidates → Test independently → MVP
3. Add US2 alternatives → Test independently
4. Add US3 determinism/isolation → Test independently
5. Polish (README, quickstart, full `npm test`)

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2 unit/contract (wire domain after US1 domain lock)
   - Developer C: User Story 3 unit/contract (wire isolation after US1 service)
3. Stories share domain module — serialize conflicting edits

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Prefer gap assertions over breaking already-green tests
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Behavior is locked to `008` — do not retune score weights or add AI/budget/
  nutrition
- No new standalone suggest HTTP route — organizers use generate + reject only
- Naming: MealSuggestionEngine ≡ `meal-suggestion.ts` + `MealSuggestionService`
- SuggestionContext / SuggestionResult are logical only — do not add new
  persisted entities or required DTO types for them
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break
  independence, from-scratch engine rewrite
