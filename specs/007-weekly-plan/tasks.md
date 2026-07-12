# Tasks: Weekly Plans

**Input**: Design documents from `/specs/007-weekly-plan/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — `plan.md` scopes Vitest unit/integration/contract suites for
WeeklyPlan CRUD, Monday week-start validation, per-slot assign/clear/status,
same-Recipe multi-day allow, Recipe-in-use delete block, and plan cap 104

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing stack and reserve weekly-plan module / test layout

- [x] T001 Verify project layout (`src/domain/`, `src/services/`, `src/api/`, `src/db/`, `tests/{unit,integration,contract}/`) matches `specs/007-weekly-plan/plan.md` and create any missing weekly-plan-related directories
- [x] T002 [P] Confirm npm scripts (`dev`, `db:migrate`, `test`) and Vitest config in `package.json` / `vitest.config.ts` support new weekly-plan suites without config changes (adjust only if drift found)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, error codes, and weekly-plan domain validation shared by all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add `WEEKLY_PLAN_CONFLICT`, `WEEKLY_PLAN_LIBRARY_FULL`, and `RECIPE_IN_USE` to `ErrorCode` plus helpers (`WEEKLY_PLAN_CONFLICT` / `WEEKLY_PLAN_LIBRARY_FULL` / `RECIPE_IN_USE` → 409) in `src/domain/errors.ts` (reuse existing `VALIDATION_ERROR`, `NOT_FOUND`)
- [x] T004 [P] Add `weekly_plans` and `meal_slots` tables to Drizzle schema in `src/db/schema.ts` per `specs/007-weekly-plan/data-model.md` (`weekly_plans`: household_id, week_start_date text, timestamps, unique `(household_id, week_start_date)`; `meal_slots`: weekly_plan_id FK ON DELETE CASCADE, day text, recipe_id text, status text, timestamps, unique `(weekly_plan_id, day)`, index on `recipe_id`)
- [x] T005 Create SQLite migration `src/db/migrations/0006_weekly_plans.sql` for `weekly_plans` + `meal_slots` and ensure `runMigrations` in `src/db/client.ts` / `src/db/migrate.ts` applies it
- [x] T006 Implement WeeklyPlan domain types, constants (plan cap 104), weekday enum (`monday`…`sunday`), status enum (`pending`|`approved`|`rejected`), `assertMondayWeekStart` (ISO `YYYY-MM-DD` + UTC `getUTCDay() === 1`), and slot materialization helper (always seven days Monday–Sunday; empty → null recipe/status) in `src/domain/weekly-plan.ts`

**Checkpoint**: Foundation ready — schema and weekly-plan validation available for story work

---

## Phase 3: User Story 1 - Create a weekly plan and assign meals (Priority: P1) 🎯 MVP

**Goal**: Organizer can create a WeeklyPlan for a Monday week-start with zero to seven initial day→Recipe slots; empty week-start-only create allowed; filled slots start `pending`; same Recipe may appear on multiple days; duplicate week and library cap enforced; non-Monday rejected.

**Independent Test**: POST with Monday `weekStartDate` only → reopen shows seven empty slots; POST with slots → pending statuses and recipe titles; past Monday week-start succeeds; non-Monday → `VALIDATION_ERROR` no row; duplicate week → `WEEKLY_PLAN_CONFLICT` 409; at 104 plans, next create → `WEEKLY_PLAN_LIBRARY_FULL` 409; unknown Recipe → `NOT_FOUND`; duplicate day in payload → `VALIDATION_ERROR`; same Recipe on two days succeeds.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US1] Unit tests for Monday week-start validation (accept Monday UTC date; reject non-Monday / malformed), weekday enum, status enum, and seven-day materialization (empty days null) in `tests/unit/weekly-plan.test.ts`
- [x] T008 [P] [US1] Integration tests for `createWeeklyPlan` success (empty and with slots; slots start pending; same Recipe on two days; past Monday week-start e.g. a Monday before “today” succeeds), non-Monday reject (no row), unknown Recipe (`NOT_FOUND`), duplicate day in payload → `VALIDATION_ERROR`, duplicate week → `WEEKLY_PLAN_CONFLICT`, and library full: with 104 existing plans, create #105 returns `WEEKLY_PLAN_LIBRARY_FULL` / HTTP 409 and leaves count at 104 in `tests/integration/weekly-plan.integration.test.ts`
- [x] T009 [P] [US1] Contract tests for `POST /weekly-plans` (`CreateWeeklyPlanRequest`) per `specs/007-weekly-plan/contracts/weekly-plans.openapi.yaml` in `tests/contract/weekly-plans.contract.test.ts`

### Implementation for User Story 1

- [x] T010 [US1] Implement `WeeklyPlanService.createWeeklyPlan` in `src/services/weekly-plan-service.ts` (validate Monday week-start; optional initial slots; reject duplicate days; load Recipes; insert plan + slot rows with `status=pending`; enforce ≤104 and unique week-start; default-scoped to `DEFAULT_HOUSEHOLD_ID` but accept injectable `householdId` for isolation tests)
- [x] T011 [US1] Add Zod transport-only `CreateWeeklyPlanRequest` schemas and `POST /weekly-plans` in `src/api/routes/weekly-plans.ts` mapping domain errors via shared/error mapping pattern from `src/api/routes/grocery-items.ts`
- [x] T012 [US1] Mount weekly-plan routes in `src/api/app.ts` with a `WeeklyPlanService` instance (extend `onError` / `mapDomainError` for `WEEKLY_PLAN_CONFLICT` / `WEEKLY_PLAN_LIBRARY_FULL` / `RECIPE_IN_USE` → 409)
- [x] T013 [US1] Ensure successful create returns `201` with full WeeklyPlan body (`weekStartDate`, seven `slots` Monday–Sunday, filled slots with `recipeId`/`recipeTitle`/`status: pending`) in `src/api/routes/weekly-plans.ts`

**Checkpoint**: US1 MVP — weekly plan create works end-to-end

---

## Phase 4: User Story 2 - Browse and view weekly plans (Priority: P2)

**Goal**: Organizer can list household weekly plans newest week-start first and open plan detail with seven calendar-ordered days; empty library is valid.

**Independent Test**: With ≥2 seeded plans for different weeks, GET list returns items ordered by `weekStartDate` DESC with distinguishable entries and `maxWeeklyPlans: 104`; GET detail shows Monday–Sunday slots with recipe titles/statuses; empty DB returns empty `items`.

### Tests for User Story 2

- [x] T014 [US2] Contract tests for `GET /weekly-plans` and `GET /weekly-plans/{weeklyPlanId}` in `tests/contract/weekly-plans.contract.test.ts` (append; do not parallel with US1 contract authors)
- [x] T015 [US2] Integration tests for list (including empty; newest week-start first; `filledSlotCount`) and get detail (seven days materialized) in `tests/integration/weekly-plan.integration.test.ts` (append; do not parallel with US1 integration authors)

### Implementation for User Story 2

- [x] T016 [US2] Implement `listWeeklyPlans` (order by `week_start_date` DESC; include `filledSlotCount`) and `getWeeklyPlan` (join Recipe titles; materialize seven days) on `src/services/weekly-plan-service.ts` scoped to household
- [x] T017 [US2] Implement `GET /weekly-plans` and `GET /weekly-plans/{weeklyPlanId}` in `src/api/routes/weekly-plans.ts` per `specs/007-weekly-plan/contracts/weekly-plans.openapi.yaml`
- [x] T018 [US2] Ensure list response includes `items` + `maxWeeklyPlans: 104` and `404` for missing plan ids in `src/api/routes/weekly-plans.ts`

**Checkpoint**: US1 + US2 — create, list, and view work independently

---

## Phase 5: User Story 3 - Modify, approve, or reject meal slots (Priority: P2)

**Goal**: Organizer can per-slot assign/replace Recipe (resets to `pending`), clear a day, or set status on a filled slot without rewriting other days; Recipe library delete is blocked while any slot references that Recipe (`RECIPE_IN_USE`).

**Independent Test**: PUT assign changes one day → other days unchanged, status `pending`; PUT status approved/rejected → Recipe unchanged; status on empty day → `VALIDATION_ERROR`; DELETE clear → empty slot; DELETE clear on already-empty day → idempotent success (200 plan, day still empty); DELETE Recipe while referenced → `RECIPE_IN_USE` 409; after clear/plan delete, Recipe delete succeeds; week-start immutable (no plan-level week-start update API).

### Tests for User Story 3

- [x] T019 [US3] Contract tests for `PUT /weekly-plans/{weeklyPlanId}/slots/{day}`, `DELETE /weekly-plans/{weeklyPlanId}/slots/{day}`, and `PUT /weekly-plans/{weeklyPlanId}/slots/{day}/status` in `tests/contract/weekly-plans.contract.test.ts` (append; do not parallel with earlier contract authors)
- [x] T020 [US3] Integration tests for assign/replace (status reset to pending; other days unchanged), clear slot, idempotent clear of already-empty day (200 + empty day), set status success, status on empty → `VALIDATION_ERROR`, status body with `recipeId` → `VALIDATION_ERROR`, unknown Recipe on assign → `NOT_FOUND`, Recipe delete while slotted → `RECIPE_IN_USE` 409, and household isolation (plans in household A never appear for household B) in `tests/integration/weekly-plan.integration.test.ts` (append; do not parallel with earlier authors)
- [x] T021 [P] [US3] Unit tests for slot status transition rules (empty cannot set status; assign always yields pending) in `tests/unit/weekly-plan.test.ts` (append; coordinate if US1 unit author still active)

### Implementation for User Story 3

- [x] T022 [US3] Implement `assignSlot`, `clearSlot`, and `setSlotStatus` on `src/services/weekly-plan-service.ts` (per-slot only; assign sets `pending`; clear deletes row or no-ops if already empty; status requires filled slot; bump plan `updatedAt`; last successful write wins per day)
- [x] T023 [US3] Implement `PUT .../slots/{day}`, `DELETE .../slots/{day}` (200 + full WeeklyPlan), and `PUT .../slots/{day}/status` with Zod `AssignSlotRequest` / `SetSlotStatusRequest` (`additionalProperties: false`) in `src/api/routes/weekly-plans.ts`
- [x] T024 [US3] Export `assertRecipeNotInPlan` from `src/services/weekly-plan-service.ts` and update `RecipeService.deleteRecipe` in `src/services/recipe-service.ts` to call it; raise `RECIPE_IN_USE` (409) when a `meal_slots` row references the Recipe; leave slots unchanged (no cascade). Document `RECIPE_IN_USE` on `DELETE /recipes/{recipeId}` in `specs/003-recipe/contracts/recipes.openapi.yaml` (Error enum + 409 response) and cover in `tests/integration/weekly-plan.integration.test.ts` and/or `tests/contract/recipes.contract.test.ts`
- [x] T025 [US3] Confirm week-start is immutable by absence of any PUT/PATCH on plan root for `weekStartDate` (organizers create a new plan for a different week) and out-of-scope boundaries remain intact: no GenerateWeeklyMeals, no post-reject alternatives, no BuildGroceryList, no multi-meal-types-per-day in `src/api/routes/weekly-plans.ts` / `src/services/weekly-plan-service.ts`

**Checkpoint**: US1–US3 — create/list/view + per-slot ops + Recipe-in-use guard independently functional

---

## Phase 6: User Story 4 - Remove a weekly plan (Priority: P3)

**Goal**: Organizer can permanently delete a WeeklyPlan (cascading its slots); other weeks unchanged; delete confirmation is UI-only.

**Independent Test**: DELETE plan → absent from list/detail (`404`); other plans remain; slots cascade-removed so previously referenced Recipes become deletable if no other plan references them.

### Tests for User Story 4

- [x] T026 [US4] Contract tests for `DELETE /weekly-plans/{weeklyPlanId}` in `tests/contract/weekly-plans.contract.test.ts` (append; do not parallel with earlier contract authors)
- [x] T027 [US4] Integration tests for permanent plan delete (`204`), delete-not-found, other plans unchanged, and Recipe delete unblocked after last referencing plan is removed in `tests/integration/weekly-plan.integration.test.ts` (append; do not parallel with earlier authors)

### Implementation for User Story 4

- [x] T028 [US4] Implement `deleteWeeklyPlan` (permanent; cascade delete slots via FK or ordered deletes) on `src/services/weekly-plan-service.ts`
- [x] T029 [US4] Implement `DELETE /weekly-plans/{weeklyPlanId}` (`204` on success) in `src/api/routes/weekly-plans.ts`
- [x] T030 [US4] Confirm delete does not require a confirm API and that subsequent get/list omit the plan in `src/api/routes/weekly-plans.ts` / `src/services/weekly-plan-service.ts`

**Checkpoint**: All four user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and operator readiness

- [x] T031 [P] Update root `README.md` with Weekly Plans feature pointer and link to `specs/007-weekly-plan/quickstart.md`; confirm agent plan pointer is `specs/007-weekly-plan/plan.md`
- [x] T032 Validate quickstart smoke flows (create Recipe, empty plan, plan with slots, list, get, assign, approve, reject, clear, non-Monday reject, duplicate week, status on empty, Recipe-in-use, plan then Recipe delete, restart persistence) per `specs/007-weekly-plan/quickstart.md`
- [x] T033 [P] Run full `npm test` and fix any regressions in weekly-plan, grocery, pantry, ingredient, recipe, preference, or family-member suites
- [x] T034 Confirm Recipe library CRUD (aside from delete-in-use guard) and GroceryItem CRUD remain unchanged in `src/services/recipe-service.ts` / `src/services/grocery-item-service.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately (builds on `001`–`006`)
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; uses created plans from US1 for demos but is independently testable with seeded rows
- **User Story 3 (Phase 5)**: Depends on Foundational; needs existing plans/slots (seed in tests); Recipe-in-use depends on US1 create/assign path existing
- **User Story 4 (Phase 6)**: Depends on Foundational; needs existing plans; practically follows US1 create path
- **Polish (Phase 7)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on US2–US4
- **User Story 2 (P2)**: After Foundational — independently testable with seeded weekly plans
- **User Story 3 (P2)**: After Foundational — independently testable with seeded plans/slots; Recipe-in-use needs slot rows
- **User Story 4 (P3)**: After Foundational — independently testable with seeded plans; practically follows US1

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Domain/service before endpoints
- Story complete before moving to next priority (or parallelize if staffed)

### Parallel Opportunities

- T001–T002 setup can proceed together
- T003 and T004 are [P] within Foundational (different files); T005 depends on T004; T006 depends on T003
- T007–T009 US1 tests can run in parallel (different files)
- T014/T015/T019/T020/T026/T027 append shared contract/integration files — **not** parallel with each other or with T008/T009 authors
- T021 may append `weekly-plan.test.ts` — coordinate with T007
- After Foundational, US1/US2/US3/US4 can proceed in parallel if capacity allows (watch shared files: `weekly-plan-service.ts`, `weekly-plans.ts`, `app.ts`, `recipe-service.ts`)

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Unit tests in tests/unit/weekly-plan.test.ts"
Task: "Integration tests in tests/integration/weekly-plan.integration.test.ts"
Task: "Contract tests for POST /weekly-plans in tests/contract/weekly-plans.contract.test.ts"

# Then implement sequentially (shared service/route files):
Task: "WeeklyPlanService.createWeeklyPlan in src/services/weekly-plan-service.ts"
Task: "POST /weekly-plans in src/api/routes/weekly-plans.ts"
Task: "Mount routes in src/api/app.ts"
```

---

## Parallel Example: User Story 3

```bash
# After earlier contract/integration authors finish (shared files):
Task: "Contract tests for slot assign/clear/status (append)"
Task: "Integration tests for per-slot ops + RECIPE_IN_USE (append)"
Task: "Unit tests for status transition rules (append weekly-plan.test.ts)"

# Implementation:
Task: "assignSlot/clearSlot/setSlotStatus in src/services/weekly-plan-service.ts"
Task: "Slot routes in src/api/routes/weekly-plans.ts"
Task: "assertRecipeNotInPlan + RecipeService.deleteRecipe guard"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Create + validation independently
5. Demo via POST; proceed to US2 for browse

### Incremental Delivery

1. Setup + Foundational → schema + validate ready
2. US1 → create weekly plan (MVP)
3. US2 → list / view
4. US3 → per-slot assign/clear/status + Recipe-in-use
5. US4 → permanent plan delete
6. Polish → quickstart + README + full test run

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2 (coordinate on `weekly-plans.ts` / `weekly-plan-service.ts`)
   - Developer C: User Story 3 (coordinate on same shared files + `recipe-service.ts`)
   - Developer D: User Story 4 after create path exists
3. Merge carefully around `src/api/routes/weekly-plans.ts`, `src/services/weekly-plan-service.ts`, `src/services/recipe-service.ts`, and `src/api/app.ts`

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Do not implement GenerateWeeklyMeals, MealSuggestionEngine, post-reject
  alternatives, breakfast/lunch/dinner multi-slots, BuildGroceryList from
  approved meals, preference/rotation scoring, or week-start mutation after create
- Do not add p95/sub-200ms latency gates in this feature (plan stretch target
  only — SC-002 is a manual UX outcome, not a load harness)
- SC-002 and SC-004 are manual UX outcomes validated during T032 quickstart /
  organizer demos; do not add automated timing or findability harnesses
- Error split: omit/malformed fields, non-Monday date, invalid day/status,
  status on empty, unexpected `recipeId` on status body → `VALIDATION_ERROR`
  (400); duplicate week → `WEEKLY_PLAN_CONFLICT` (409); at 104 plans →
  `WEEKLY_PLAN_LIBRARY_FULL` (409); Recipe delete while slotted →
  `RECIPE_IN_USE` (409); unknown plan/Recipe → `NOT_FOUND` (404)
- Canonical slot statuses: `pending` | `approved` | `rejected` (not `suggested`)
- Same Recipe MAY appear on multiple days; uniqueness is per `(plan, day)` only
- Past/current/future Monday week-starts all allowed
- Week-start immutability is by absence of any plan-level week-start update API
- Slot clear returns 200 + full WeeklyPlan; clear of already-empty day is idempotent
- List summaries include `filledSlotCount` (0–7)
- `RECIPE_IN_USE` MUST be documented on Recipe delete OpenAPI (T024)
- Delete confirmation is UI-only; no confirm API in this feature
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
