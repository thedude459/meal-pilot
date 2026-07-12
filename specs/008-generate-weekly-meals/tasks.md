# Tasks: Generate Weekly Meals

**Input**: Design documents from `/specs/008-generate-weekly-meals/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — `plan.md` scopes Vitest unit/integration/contract suites for
dislike phrase/token match, dietary hard filter, deterministic ranking,
fill-empty vs regenerate-non-approved, reject→alternative, no-preferences,
partial coverage report, and household isolation

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing stack and reserve meal-suggestion module / test layout

- [x] T001 Verify project layout (`src/domain/`, `src/services/`, `src/api/`, `src/db/`, `tests/{unit,integration,contract}/`) matches `specs/008-generate-weekly-meals/plan.md` and create any missing meal-suggestion-related directories
- [x] T002 [P] Confirm npm scripts (`dev`, `db:migrate`, `test`) and Vitest config in `package.json` / `vitest.config.ts` support new generate-weekly-meals suites without config changes (adjust only if drift found)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Error codes and pure MealSuggestionEngine domain helpers shared by all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add `GENERATION_NO_PREFERENCES` to `ErrorCode` plus helper (`GENERATION_NO_PREFERENCES` → 400) in `src/domain/errors.ts` (reuse `VALIDATION_ERROR`, `WEEKLY_PLAN_LIBRARY_FULL`, `NOT_FOUND`)
- [x] T004 Implement phrase/token matching helpers (case-insensitive exact equality, token, and contiguous multi-word phrase) for likes/dislikes against title and ingredient names in `src/domain/meal-suggestion.ts`
- [x] T005 Implement dietary hard-filter helper (Recipe safe iff every required restriction ID is in `dietaryAttributeIds`) and household preference aggregation (union restrictions/dislikes/likes across members; zero members → `GENERATION_NO_PREFERENCES`; empty profile on an existing member remains evaluable) in `src/domain/meal-suggestion.ts`
- [x] T006 Implement soft scoring (likes, pantry utilization, timing via prep+cook minutes, cuisine variety, rotation penalties) with deterministic tie-break (`recipeId` ascending) and soft-relax of rotation when no candidates remain in `src/domain/meal-suggestion.ts` per `specs/008-generate-weekly-meals/research.md`
- [x] T007 Implement eligible-day selection (`fill-empty` vs `regenerate-non-approved`), Monday→Sunday greedy assign, and `GenerationReport` / `AlternativeOutcome` pure builders in `src/domain/meal-suggestion.ts` per `specs/008-generate-weekly-meals/data-model.md`
- [x] T008 Extend `mapDomainError` / `onError` in `src/api/app.ts` (and shared route error mapping if used) to map `GENERATION_NO_PREFERENCES` → HTTP 400

**Checkpoint**: Foundation ready — matcher/filter/rank/assign helpers and error code available for story work

---

## Phase 3: User Story 1 - Generate a preference-aware weekly plan (Priority: P1) 🎯 MVP

**Goal**: Organizer can `POST /weekly-plans/generate` for a Monday week-start (default `fill-empty`); system creates or reuses WeeklyPlan, fills all empty days from preference-safe library Recipes as `pending`, never slots hard-excluded Recipes, returns `plan` + `report`.

**Independent Test**: With ≥2 members/preferences and safe+unsafe Recipes, generate for a week with no plan → plan exists, filled slots only safe Recipes in `pending`; non-Monday → `VALIDATION_ERROR`; zero members → `GENERATION_NO_PREFERENCES`; existing plan with some filled slots → only empties filled.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Unit tests for dislike/like phrase-token match, dietary hard filter, scoring/tie-break (including pantry utilization affecting relative scores), and `fill-empty` eligible days in `tests/unit/meal-suggestion.test.ts`
- [x] T010 [P] [US1] Integration tests for generate create-or-reuse plan, hard exclusions (dietary + dislike), default `fill-empty` leaves filled slots unchanged, non-Monday `VALIDATION_ERROR`, zero members `GENERATION_NO_PREFERENCES`, plan library full on create `WEEKLY_PLAN_LIBRARY_FULL`, and household isolation (generate for household A never reads preferences/recipes/plans or writes slots for household B) in `tests/integration/generate-weekly-meals.integration.test.ts`
- [x] T011 [P] [US1] Contract tests for `POST /weekly-plans/generate` (`GenerateWeeklyMealsRequest` / `GenerateWeeklyMealsResponse`) per `specs/008-generate-weekly-meals/contracts/generate-weekly-meals.openapi.yaml` in `tests/contract/generate-weekly-meals.contract.test.ts`

### Implementation for User Story 1

- [x] T012 [US1] Implement `MealSuggestionService.generateWeeklyMeals` in `src/services/meal-suggestion-service.ts` (load members/preferences/recipes/pantry/recent plans; validate Monday week-start + mode default `fill-empty`; create or reuse WeeklyPlan via `WeeklyPlanService`; assign only eligible empty days with `pending`; return `{ plan, report }`; reject unknown `days` subset fields with `VALIDATION_ERROR`; injectable `householdId` for isolation tests)
- [x] T013 [US1] Add Zod transport-only `GenerateWeeklyMealsRequest` schema (`additionalProperties: false`) and `POST /weekly-plans/generate` in `src/api/routes/generate-weekly-meals.ts` mapping domain errors
- [x] T014 [US1] Mount generate routes in `src/api/app.ts` with a `MealSuggestionService` instance wired to existing WeeklyPlan/Recipe/FamilyMember/Pantry services
- [x] T015 [US1] Ensure successful generate returns `200` with `plan` (seven slots) and `report` (`mode`, `filledDays`, `unfilledDays`) in `src/api/routes/generate-weekly-meals.ts`

**Checkpoint**: US1 MVP — preference-aware generate (fill-empty) works end-to-end

---

## Phase 4: User Story 2 - Review, approve, reject, and get alternatives (Priority: P1)

**Goal**: Organizer can approve slots via existing WeeklyPlan status action; rejecting a filled slot automatically applies one preference-safe alternative (→ `pending`) or leaves `rejected` with `alternativeOutcome` when none exists; manual assign/replace remains available.

**Independent Test**: On a generated plan, approve one day → stays approved under later fill-empty; reject with ≥1 alt → different Recipe `pending` + `alternativeOutcome.applied: true`; reject with no alt → durable `rejected` + `applied: false`; other days unchanged.

### Tests for User Story 2

- [x] T016 [US2] Contract tests for `PUT /weekly-plans/{weeklyPlanId}/slots/{day}/status` extended response with `alternativeOutcome` when status is `rejected` per `specs/008-generate-weekly-meals/contracts/generate-weekly-meals.openapi.yaml` in `tests/contract/generate-weekly-meals.contract.test.ts` (append; do not parallel with US1 contract authors)
- [x] T017 [US2] Integration tests for approve unchanged by generate, reject→alternative success, reject→no alternative, reject does not rewrite other days, and approve/pending paths omit or null `alternativeOutcome` in `tests/integration/generate-weekly-meals.integration.test.ts` (append; do not parallel with US1 integration authors)
- [x] T018 [P] [US2] Unit tests for alternative candidate exclusion of current `recipeId` and rotation soft-relax for single-day pick in `tests/unit/meal-suggestion.test.ts` (append; coordinate if US1 unit author still active)

### Implementation for User Story 2

- [x] T019 [US2] Implement `MealSuggestionService.rejectWithAlternative` in `src/services/meal-suggestion-service.ts` (validate filled slot; pick one safe different Recipe; on success assign/replace with `pending`; on failure persist `rejected` via WeeklyPlanService; return plan + `alternativeOutcome`)
- [x] T020 [US2] Wire `PUT .../slots/{day}/status` in `src/api/routes/weekly-plans.ts` so `status: "rejected"` delegates to `MealSuggestionService.rejectWithAlternative`; `pending`/`approved` keep existing `WeeklyPlanService.setSlotStatus` behavior
- [x] T021 [US2] Ensure reject response includes WeeklyPlan fields plus `alternativeOutcome` (`applied` / optional `reason: NO_SAFE_ALTERNATIVE`) in `src/api/routes/weekly-plans.ts`; update `specs/007-weekly-plan/contracts/weekly-plans.openapi.yaml` status response notes to point at generate-weekly-meals reject alternative behavior (or dual-document consistently)
- [x] T022 [US2] Confirm manual `PUT .../slots/{day}` assign/replace still resets to `pending` without requiring reject flow in `src/api/routes/weekly-plans.ts` / `src/services/weekly-plan-service.ts`

**Checkpoint**: US1 + US2 — generate + approve/reject→alternative independently functional

---

## Phase 5: User Story 3 - Regenerate empty or non-approved days (Priority: P2)

**Goal**: Organizer can generate with `mode: regenerate-non-approved` to refresh all empty/pending/rejected days while leaving approved slots intact; default `fill-empty` still only fills empties.

**Independent Test**: Mixed plan (approved + empty + pending + rejected) → regenerate updates non-approved only; approved unchanged; fill-empty on same plan leaves pending/rejected untouched.

### Tests for User Story 3

- [x] T023 [US3] Contract tests for `mode: regenerate-non-approved` on `POST /weekly-plans/generate` in `tests/contract/generate-weekly-meals.contract.test.ts` (append; do not parallel with earlier contract authors)
- [x] T024 [US3] Integration tests for regenerate-non-approved vs fill-empty eligibility, approved intact, and unfilled reasons when no candidates in `tests/integration/generate-weekly-meals.integration.test.ts` (append; do not parallel with earlier authors)
- [x] T025 [P] [US3] Unit tests for `regenerate-non-approved` eligible-day selection in `tests/unit/meal-suggestion.test.ts` (append; coordinate if unit author still active)

### Implementation for User Story 3

- [x] T026 [US3] Extend `MealSuggestionService.generateWeeklyMeals` in `src/services/meal-suggestion-service.ts` to honor `regenerate-non-approved` (refresh empty/pending/rejected; never touch approved; always all eligible days)
- [x] T027 [US3] Ensure Zod enum accepts both modes and rejects unknown mode / day-subset fields with `VALIDATION_ERROR` in `src/api/routes/generate-weekly-meals.ts`
- [x] T028 [US3] Confirm `report.mode` reflects the requested mode and `filledDays`/`unfilledDays` only cover eligible days for that run in `src/services/meal-suggestion-service.ts`

**Checkpoint**: US1–US3 — both generate modes work; approved slots protected

---

## Phase 6: User Story 4 - Incomplete library coverage (Priority: P3)

**Goal**: When safe library Recipes cannot fill all eligible days, generation still succeeds with partial fills, reports unfilled days (`NO_SAFE_CANDIDATES`), and never creates AI Recipes.

**Independent Test**: Thin safe library → some/all target days empty; `report.unfilledDays` populated; recipe library count unchanged (no new AI rows); zero safe recipes → plan exists/reused with empty eligible days + clear report.

### Tests for User Story 4

- [x] T029 [US4] Integration tests for partial coverage report, zero safe candidates, and assert no new Recipe rows / no AI creation path invoked during generate in `tests/integration/generate-weekly-meals.integration.test.ts` (append; do not parallel with earlier authors)
- [x] T030 [P] [US4] Unit tests for report builder when greedy assign leaves days unfilled after soft-relax in `tests/unit/meal-suggestion.test.ts` (append; coordinate if unit author still active)

### Implementation for User Story 4

- [x] T031 [US4] Ensure generate persists successful day writes and returns `unfilledDays[{ day, reason: "NO_SAFE_CANDIDATES" }]` without failing the HTTP request in `src/services/meal-suggestion-service.ts` / `src/api/routes/generate-weekly-meals.ts`
- [x] T032 [US4] Confirm MealSuggestionService has no AI recipe create calls and does not write `source: "ai"` Recipes in `src/services/meal-suggestion-service.ts` (library select only; hybrid AI deferred not waived)
- [x] T033 [US4] Confirm out-of-scope boundaries remain intact: no BuildGroceryList, no pantry quantity mutation, no day-subset generate, no budget filter, no nutrition score in `src/services/meal-suggestion-service.ts` / `src/api/routes/generate-weekly-meals.ts`

**Checkpoint**: All four user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and operator readiness

- [x] T034 [P] Update root `README.md` with Generate Weekly Meals feature pointer and link to `specs/008-generate-weekly-meals/quickstart.md`; confirm agent plan pointer is `specs/008-generate-weekly-meals/plan.md` in `.cursor/rules/specify-rules.mdc`
- [x] T035 Validate quickstart smoke flows (seed member/preferences/recipes, generate, approve, reject→alternative, fill-empty vs regenerate, non-Monday, no-members) per `specs/008-generate-weekly-meals/quickstart.md`
- [x] T036 [P] Run full `npm test` and fix any regressions in generate-weekly-meals, weekly-plan, recipe, preference, family-member, pantry, grocery, or ingredient suites
- [x] T037 Confirm WeeklyPlan CRUD (aside from reject→alternative wiring) and Recipe/Pantry/Grocery services remain behaviorally unchanged for non-reject paths in `src/services/weekly-plan-service.ts` / `src/services/recipe-service.ts` / `src/services/pantry-item-service.ts` / `src/services/grocery-item-service.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately (builds on `001`–`007`)
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; practically uses generated/seeded plans; reject path can be tested with manually assigned slots
- **User Story 3 (Phase 5)**: Depends on Foundational + generate path from US1 (mode flag)
- **User Story 4 (Phase 6)**: Depends on Foundational + generate path from US1 (report/partial coverage)
- **Polish (Phase 7)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on US2–US4
- **User Story 2 (P1)**: After Foundational — independently testable with seeded filled slots; shares `weekly-plans.ts` status route
- **User Story 3 (P2)**: After US1 generate service exists — mode extension on same service/route
- **User Story 4 (P3)**: After US1 generate service exists — report/coverage hardening on same path

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Domain/service before endpoints
- Story complete before moving to next priority (or parallelize if staffed)

### Parallel Opportunities

- T001–T002 setup can proceed together
- T003 and T008 are [P]-eligible across different files from domain work; T004 then T005 then T006–T007 are sequential on `src/domain/meal-suggestion.ts` (do not parallelize T004/T005)
- T009–T011 US1 tests can run in parallel (different files)
- T016/T017/T023/T024/T029 append shared contract/integration files — **not** parallel with each other or with T010/T011 authors
- T018/T025/T030 may append `meal-suggestion.test.ts` — coordinate with T009
- After Foundational, US2 can proceed in parallel with US1 if capacity allows (watch shared files: `weekly-plans.ts`, `meal-suggestion-service.ts`, `app.ts`)
- US3/US4 should follow US1 on shared generate service/route files

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Unit tests in tests/unit/meal-suggestion.test.ts"
Task: "Integration tests in tests/integration/generate-weekly-meals.integration.test.ts"
Task: "Contract tests for POST /weekly-plans/generate in tests/contract/generate-weekly-meals.contract.test.ts"

# Then implement sequentially (shared service/route files):
Task: "MealSuggestionService.generateWeeklyMeals in src/services/meal-suggestion-service.ts"
Task: "POST /weekly-plans/generate in src/api/routes/generate-weekly-meals.ts"
Task: "Mount routes in src/api/app.ts"
```

---

## Parallel Example: User Story 2

```bash
# After US1 contract/integration authors finish (shared files):
Task: "Contract tests for reject status + alternativeOutcome (append)"
Task: "Integration tests for approve/reject→alternative (append)"
Task: "Unit tests for alternative pick (append meal-suggestion.test.ts)"

# Implementation:
Task: "rejectWithAlternative in src/services/meal-suggestion-service.ts"
Task: "Wire rejected status in src/api/routes/weekly-plans.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Generate fill-empty independently
5. Demo via POST generate; proceed to US2 for reject→alternative

### Incremental Delivery

1. Setup + Foundational → matcher/rank helpers ready
2. US1 → preference-aware generate fill-empty (MVP)
3. US2 → reject→alternative + approve interaction
4. US3 → regenerate-non-approved mode
5. US4 → partial coverage / no-AI guarantees
6. Polish → quickstart + README + full test run

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2 (coordinate on `weekly-plans.ts` / `meal-suggestion-service.ts`)
   - Developer C: User Story 3 after US1 generate path exists
   - Developer D: User Story 4 after US1 generate path exists
3. Merge carefully around `src/services/meal-suggestion-service.ts`, `src/api/routes/generate-weekly-meals.ts`, `src/api/routes/weekly-plans.ts`, and `src/api/app.ts`

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Do not implement AI recipe creation / RecipeHybridEngine, BuildGroceryList,
  pantry quantity updates, budget filters, day-subset generate, or organizer
  candidate-picker lists
- Do not add a separate `suggested` slot status — generated fills use `pending`
- Do not add p95 latency gates in this feature (plan stretch target only —
  SC-001/SC-006 are manual UX outcomes)
- Error split: malformed/missing weekStartDate, non-Monday, invalid mode,
  unexpected day-subset → `VALIDATION_ERROR` (400); zero FamilyMembers →
  `GENERATION_NO_PREFERENCES` (400); create at 104 plans →
  `WEEKLY_PLAN_LIBRARY_FULL` (409); unknown plan on reject → `NOT_FOUND` (404);
  partial coverage is still HTTP 200 with `unfilledDays`
- Rotation window: target week + previous 2 weeks; soft-relax before leaving
  day empty; hard dietary/dislike rules never relax
- Dislike match: case-insensitive exact phrase/token on Recipe title and
  ingredient names (no fuzzy/NLP)
- Dietary: every member hard restriction ID must appear on Recipe
  `dietaryAttributeIds`
- `GENERATION_NO_PREFERENCES` only when zero FamilyMembers; empty PreferenceProfile
  on an existing member is evaluable
- Soft balance: cuisine variety + prep/cook timing (difficulty proxy); nutrition
  scoring deferred (not waived)
- Hybrid AI (`RecipeHybridEngine`) deferred, not waived
- Canonical slot statuses remain `pending` | `approved` | `rejected`
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
