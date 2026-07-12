# Tasks: Build Grocery List

**Input**: Design documents from `/specs/009-build-grocery-list/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — `plan.md` scopes Vitest unit/integration/contract suites for
name/alias match, unit-conflict merge, pantry availability/expiration UTC,
net-need math, merged-set membership, checked shortfall, rebuild remove vs
leave rules, atomic cap fail, zero-approved / missing plan / non-Monday

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing stack and reserve grocery-list-builder module / test layout

- [x] T001 Verify project layout (`src/domain/`, `src/services/`, `src/api/`, `src/db/`, `tests/{unit,integration,contract}/`) matches `specs/009-build-grocery-list/plan.md` and create any missing grocery-list-builder-related directories
- [x] T002 [P] Confirm npm scripts (`dev`, `db:migrate`, `test`) and Vitest config in `package.json` / `vitest.config.ts` support new build-grocery-list suites without config changes (adjust only if drift found)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Error codes and pure GroceryListBuilder domain helpers shared by all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add `BUILD_NO_APPROVED_MEALS` to `ErrorCode` plus helper (`BUILD_NO_APPROVED_MEALS` → 400) in `src/domain/errors.ts` (reuse `VALIDATION_ERROR`, `NOT_FOUND`, `GROCERY_LIST_FULL`)
- [x] T004 Implement catalog match-index builder and Recipe-line name match using `normalizeIngredientLabel` + `labelKey` (display name + aliases; exact key only; no fuzzy) in `src/domain/grocery-list-builder.ts`
- [x] T005 Implement merge across approved slots (sum `roundQuantity` only when `unitId === defaultUnitId`; unit conflicts reported; name match alone places Ingredient in merged set even if all lines conflict with qty 0) in `src/domain/grocery-list-builder.ts` per `specs/009-build-grocery-list/data-model.md`
- [x] T006 Implement available-pantry subtraction (null expiration or `expirationDate >= todayUTC` available; expired not subtracted; `netNeed = max(0, roundQuantity(mergedNeed - availablePantry))`) in `src/domain/grocery-list-builder.ts`
- [x] T007 Implement sync plan + `BuildReport` pure builders (create/update/remove unchecked for merged set; leave checked unchanged with `remainingShortfall`; leave out-of-merged-set unchecked unchanged; deterministic sort orders) in `src/domain/grocery-list-builder.ts` per `specs/009-build-grocery-list/research.md`
- [x] T008 Extend `mapDomainError` / `onError` in `src/api/app.ts` (and shared route error mapping if used) to map `BUILD_NO_APPROVED_MEALS` → HTTP 400

**Checkpoint**: Foundation ready — match/merge/subtract/report helpers and error code available for story work

---

## Phase 3: User Story 1 - Build a pantry-aware grocery list from approved meals (Priority: P1) 🎯 MVP

**Goal**: Organizer can `POST /grocery-items/build` for a Monday week-start; system reads only **approved** slots, merges matched Ingredients, subtracts available pantry, writes unchecked GroceryItems, returns grouped list + `BuildReport`.

**Independent Test**: WeeklyPlan with ≥2 approved slots sharing a catalog-matched ingredient + partial pantry cover → merged net-need GroceryItems; fully covered omitted as unchecked buy; pending/rejected contribute nothing; non-Monday → `VALIDATION_ERROR`; missing plan → `NOT_FOUND`; zero approved → `BUILD_NO_APPROVED_MEALS`.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Unit tests for name/alias match, unit-ok merge vs unit-conflict (merged-set membership with qty 0), pantry partial/full/expired UTC, net-need math, and quantity rounding in `tests/unit/grocery-list-builder.test.ts`
- [x] T010 [P] [US1] Integration tests for build from approved meals only (ignore pending/rejected), merge across days, pantry shortfall, fully covered omit, non-Monday `VALIDATION_ERROR`, missing plan `NOT_FOUND`, zero approved `BUILD_NO_APPROVED_MEALS`, and household isolation in `tests/integration/build-grocery-list.integration.test.ts`
- [x] T011 [P] [US1] Contract tests for `POST /grocery-items/build` (`BuildGroceryListRequest` / `BuildGroceryListResponse` + error codes) per `specs/009-build-grocery-list/contracts/build-grocery-list.openapi.yaml` in `tests/contract/build-grocery-list.contract.test.ts`

### Implementation for User Story 1

- [x] T012 [US1] Implement `GroceryListBuilderService.buildGroceryList` in `src/services/grocery-list-builder-service.ts` (resolve plan via existing `WeeklyPlanService.findByWeekStart` for Monday `weekStartDate`; reject zero approved; load Recipes/Ingredients/Pantry/GroceryItems; compute sync plan via domain helpers; apply create/replace/delete in one SQLite transaction; preflight cap → `GROCERY_LIST_FULL` with no partial writes; return `{ groups, maxGroceryItems, report }`; injectable `householdId` for isolation tests)
- [x] T013 [US1] Add any internal sync helpers needed on `GroceryItemService` in `src/services/grocery-item-service.ts` (transactional create/replace/delete for builder) without changing public CRUD/check semantics from `006`
- [x] T014 [US1] Add Zod transport-only `BuildGroceryListRequest` schema (`additionalProperties: false`) and `POST /grocery-items/build` in `src/api/routes/build-grocery-list.ts` mapping domain errors
- [x] T015 [US1] Mount build route in `src/api/app.ts` with a `GroceryListBuilderService` instance wired to existing WeeklyPlan/Recipe/Ingredient/Pantry/Grocery services
- [x] T016 [US1] Ensure successful build returns `200` with `groups` (same shape as `GET /grocery-items`) and `report` (`weekStartDate`, `approvedSlotCount`, created/updated/removed/pantryCovered/unmatched/unitConflicts/checkedSkips) in `src/api/routes/build-grocery-list.ts`

**Checkpoint**: US1 MVP — pantry-aware build from approved meals works end-to-end

---

## Phase 4: User Story 2 - Review the built list and keep shopping progress (Priority: P1)

**Goal**: After build, list remains category-grouped per `006`; re-running build preserves checked lines unchanged and reports `remainingShortfall` when checked qty &lt; net need; unchecked lines in merged set refresh to net need.

**Independent Test**: Build → check one item → change approvals or rebuild → checked row unchanged; `report.checkedSkips` includes shortfall when need higher; unchecked refreshed; existing check/edit/remove grocery actions still work.

### Tests for User Story 2

- [x] T017 [US2] Contract tests asserting `checkedSkips` / `remainingShortfall` fields on rebuild responses per `specs/009-build-grocery-list/contracts/build-grocery-list.openapi.yaml` in `tests/contract/build-grocery-list.contract.test.ts` (append; do not parallel with US1 contract authors)
- [x] T018 [US2] Integration tests for checked preserve, shortfall reporting, unchecked refresh on rebuild, and grocery check toggle / replace / delete still work after build in `tests/integration/build-grocery-list.integration.test.ts` (append; do not parallel with US1 integration authors)
- [x] T019 [P] [US2] Unit tests for checked-skip + remainingShortfall and unchecked update/remove plan decisions in `tests/unit/grocery-list-builder.test.ts` (append; coordinate if US1 unit author still active)

### Implementation for User Story 2

- [x] T020 [US2] Ensure `GroceryListBuilderService` never mutates/deletes checked GroceryItems and populates `checkedSkips` with `remainingShortfall = max(0, netNeed - checkedQuantity)` in `src/services/grocery-list-builder-service.ts` / `src/domain/grocery-list-builder.ts`
- [x] T021 [US2] Confirm post-build `groups` ordering matches Grocery Items feature (category catalog order, Other last, A–Z within group) via list reuse in `src/services/grocery-list-builder-service.ts` / `src/services/grocery-item-service.ts`
- [x] T022 [US2] Confirm existing `PUT .../checked`, quantity replace, and delete routes in `src/api/routes/grocery-items.ts` remain unchanged and usable after builds

**Checkpoint**: US1 + US2 — build + checked-progress preservation independently functional

---

## Phase 5: User Story 3 - Understand unmatched or skipped ingredients (Priority: P2)

**Goal**: Builds soft-complete when some Recipe lines are unmatched or unit-conflicted; report lists skips; all-conflict / all-unmatched still `200` with empty net-need write set when appropriate; name-matched all-unit-conflict Ingredients stay in merged set (remove unchecked if present).

**Independent Test**: Approved meal with one matched + one unmatched name → matched written (subject to pantry); `report.unmatched` lists the other; unit conflict → `report.unitConflicts` and no qty contribution; all lines skippable → `200` with explanatory report, not hard-fail.

### Tests for User Story 3

- [x] T023 [US3] Contract tests for response including `unmatched` and `unitConflicts` arrays in `tests/contract/build-grocery-list.contract.test.ts` (append; do not parallel with earlier contract authors)
- [x] T024 [US3] Integration tests for mixed match/unmatch, unit conflict omit from qty, all-unmatched soft-complete, and all-unit-conflict merged-set remove of unchecked line in `tests/integration/build-grocery-list.integration.test.ts` (append; do not parallel with earlier authors)
- [x] T025 [P] [US3] Unit tests for unmatched entries, unit-conflict entries, and merged-set membership when every line conflicts in `tests/unit/grocery-list-builder.test.ts` (append; coordinate if unit author still active)

### Implementation for User Story 3

- [x] T026 [US3] Ensure builder populates deterministic `unmatched` / `unitConflicts` (sort rules from data-model) without failing the HTTP request solely due to skips in `src/services/grocery-list-builder-service.ts` / `src/domain/grocery-list-builder.ts`
- [x] T027 [US3] Verify/extend T005 merged-set behavior: name-matched all-unit-conflict Ingredients stay in merged set with net need 0 and remove unchecked grocery lines accordingly in `src/domain/grocery-list-builder.ts` (do not reimplement match/merge from scratch)
- [x] T028 [US3] Confirm no auto-create of catalog Ingredients and no unit conversion paths in `src/services/grocery-list-builder-service.ts`

**Checkpoint**: US1–US3 — soft-complete reporting works; matched lines still usable

---

## Phase 6: User Story 4 - Rebuild after plan changes (Priority: P3)

**Goal**: After approval/pantry changes, rebuild refreshes unchecked lines for the new merged set; out-of-merged-set unchecked manual adds stay; newly needed ingredients appear; pantry-now-covered merged ingredients drop unchecked lines.

**Independent Test**: Build → approve another day → rebuild adds/updates needs; unapprove so Ingredient leaves merged set → unchecked leftover for that Ingredient remains (manual-leave rule); pantry fully covers merged Ingredient → unchecked removed.

### Tests for User Story 4

- [x] T029 [US4] Integration tests for rebuild after new approvals, leave unchecked outside merged set (manual add + unapproved leftover), remove unchecked when merged+netNeed 0, and atomic `GROCERY_LIST_FULL` with no partial unchecked rebuild in `tests/integration/build-grocery-list.integration.test.ts` (append; do not parallel with earlier authors)
- [x] T030 [P] [US4] Unit tests for out-of-merged-set leave vs in-set netNeed-0 remove in `tests/unit/grocery-list-builder.test.ts` (append; coordinate if unit author still active)

### Implementation for User Story 4

- [x] T031 [US4] Ensure rebuild sync only removes unchecked lines for Ingredients in this run’s merged set with net need 0; leaves unchecked outside merged set unchanged in `src/domain/grocery-list-builder.ts` / `src/services/grocery-list-builder-service.ts`
- [x] T032 [US4] Verify/extend T012 cap preflight: fails atomically with `GROCERY_LIST_FULL` (409) and rolls back / writes nothing when a rebuild’s post-sync count would exceed 500 in `src/services/grocery-list-builder-service.ts` (integration coverage in T029; do not duplicate the US1 create path)
- [x] T033 [US4] Confirm out-of-scope boundaries remain intact: no export endpoint, no pantry quantity mutation (`UpdatePantry` deferred not waived), no servings scaling, no multi-week merge in `src/services/grocery-list-builder-service.ts` / `src/api/routes/build-grocery-list.ts`

**Checkpoint**: All four user stories independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and operator readiness

- [x] T034 [P] Update root `README.md` with Build Grocery List feature pointer and link to `specs/009-build-grocery-list/quickstart.md`; confirm agent plan pointer is `specs/009-build-grocery-list/plan.md` in `.cursor/rules/specify-rules.mdc`
- [x] T035 Validate quickstart smoke flows (catalog + recipes + approve + build, pantry shortfall, unmatched, checked rebuild, manual out-of-set add, non-Monday / zero-approved) per `specs/009-build-grocery-list/quickstart.md`
- [x] T036 [P] Run full `npm test` and fix any regressions in build-grocery-list, grocery-item, pantry, weekly-plan, generate-weekly-meals, recipe, or ingredient suites
- [x] T037 Confirm GroceryItem CRUD/check (aside from builder sync helpers) and Pantry/WeeklyPlan/Recipe services remain behaviorally unchanged for non-build paths in `src/services/grocery-item-service.ts` / `src/services/pantry-item-service.ts` / `src/services/weekly-plan-service.ts` / `src/services/recipe-service.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately (builds on `001`–`008`)
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; practically needs US1 build path for end-to-end checked flows (can unit-test sync plan alone)
- **User Story 3 (Phase 5)**: Depends on Foundational; extends report fields from US1
- **User Story 4 (Phase 6)**: Depends on Foundational; rebuild semantics extend US1/US2
- **Polish (Phase 7)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on other stories — MVP
- **User Story 2 (P1)**: After Foundational; integration builds on US1 endpoint
- **User Story 3 (P2)**: After Foundational; report completeness on US1 path
- **User Story 4 (P3)**: After Foundational; rebuild rules on US1/US2 sync behavior

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Domain helpers (Phase 2) before services
- Services before endpoints
- Story complete before moving to next priority when staffing is serial

### Parallel Opportunities

- T001 and T002 can start together (T002 is [P])
- T009–T011 (US1 tests) can run in parallel before T012–T016
- T019 / T025 / T030 unit appends can parallelize with care on the same file
- Contract/integration append tasks for US2–US4 should not parallel with earlier authors of the same file
- Polish T034 and T036 are [P]

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit tests for name/alias match, merge, pantry, net-need in tests/unit/grocery-list-builder.test.ts"
Task: "Integration tests for approved-only build + errors in tests/integration/build-grocery-list.integration.test.ts"
Task: "Contract tests for POST /grocery-items/build in tests/contract/build-grocery-list.contract.test.ts"

# After tests fail, implement service → route → mount sequentially:
Task: "Implement GroceryListBuilderService.buildGroceryList in src/services/grocery-list-builder-service.ts"
Task: "Add POST /grocery-items/build in src/api/routes/build-grocery-list.ts"
Task: "Mount build route in src/api/app.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Demo build from approved meals + pantry subtract

### Incremental Delivery

1. Setup + Foundational → helpers ready
2. US1 → pantry-aware build MVP
3. US2 → checked-progress + shortfall report
4. US3 → unmatched / unit-conflict transparency
5. US4 → rebuild after plan/pantry changes + atomic cap
6. Polish → README + quickstart + full test suite

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (owns contract/integration files initially)
   - Developer B: Unit tests + domain edge cases for US2/US3 in parallel where files differ
3. Serialize appends to shared test files

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- Export and UpdatePantry remain deferred (not waived) — do not implement in these tasks
