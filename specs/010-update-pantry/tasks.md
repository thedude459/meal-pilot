# Tasks: Update Pantry

**Input**: Design documents from `/specs/010-update-pantry/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — `plan.md` scopes Vitest unit/integration/contract suites for
cleanup-then-apply ordering, create vs increase, cap after cleanup, quantity
rounding, expired UTC boundary, preview projection parity, atomic fail on
unit/cap/zero-checked, cleanup-only reject, unchecked preserved, double-confirm
reject

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing stack and reserve pantry-manager module / test layout

- [x] T001 Verify project layout (`src/domain/`, `src/services/`, `src/api/`, `src/db/`, `tests/{unit,integration,contract}/`) matches `specs/010-update-pantry/plan.md` and create any missing pantry-manager-related directories
- [x] T002 [P] Confirm npm scripts (`dev`, `db:migrate`, `test`) and Vitest config in `package.json` / `vitest.config.ts` support new update-pantry suites without config changes (adjust only if drift found)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Error codes and pure PantryManager domain helpers shared by all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add `UPDATE_PANTRY_NO_CHECKED` to `ErrorCode` plus helper (`UPDATE_PANTRY_NO_CHECKED` → 400) in `src/domain/errors.ts` (reuse `VALIDATION_ERROR`, `UNIT_MISMATCH`, `PANTRY_INVENTORY_FULL`)
- [x] T004 Implement expired-pantry identification (`expirationDate !== null && expirationDate < todayUtc`) reusing `utcTodayDate` from `src/domain/grocery-list-builder.ts` (or extract shared helper to `src/domain/dates.ts` if preferred) in `src/domain/pantry-manager.ts`
- [x] T005 Implement pure apply projection (cleanup-then-apply when `removeExpired`; create vs increase; `currentQuantity` after cleanup; `roundQuantity` sums; preserve expiration on increase; unset on create; unit must equal Ingredient `defaultUnitId`; unknown Ingredient fails; cap check after cleanup using create count) returning report-shaped result in `src/domain/pantry-manager.ts` per `specs/010-update-pantry/data-model.md`
- [x] T006 Implement deterministic AppliedEntry / ExpiredRemovedEntry ordering (A–Z by ingredient display name) and `ApplyReport` field builders including `currentQuantity` (nullable prior pantry qty after cleanup) in `src/domain/pantry-manager.ts` per `specs/010-update-pantry/research.md` / `data-model.md`
- [x] T007 Extend `mapDomainError` / `onError` in `src/api/app.ts` (and shared route error mapping if used) to map `UPDATE_PANTRY_NO_CHECKED` → HTTP 400

**Checkpoint**: Foundation ready — projection helpers and error code available for story work

---

## Phase 3: User Story 1 - Confirm shopping and restock the pantry (Priority: P1) 🎯 MVP

**Goal**: Organizer can `POST /pantry-items/update` with ≥1 checked GroceryItem; system creates/increases PantryItems, deletes applied grocery lines, returns pantry list + `ApplyReport`; rejects zero-checked (including cleanup-only intent).

**Independent Test**: Two checked groceries (one Ingredient already in pantry, one not) → confirm increases/creates stock, removes those grocery lines, leaves unchecked unchanged; second confirm → `UPDATE_PANTRY_NO_CHECKED`; unit mismatch / cap exceed → 400/409 with no partial writes.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T008 [P] [US1] Unit tests for create vs increase, `currentQuantity` null vs number, quantity rounding, unit mismatch fail, unknown Ingredient fail, cap math (`removeExpired` false), and report applied entries in `tests/unit/pantry-manager.test.ts`
- [x] T009 [P] [US1] Integration tests for confirm create+increase, remove applied groceries, preserve unchecked, zero-checked `UPDATE_PANTRY_NO_CHECKED`, unit mismatch atomic fail, unknown Ingredient atomic fail, `PANTRY_INVENTORY_FULL` atomic fail, double-confirm `UPDATE_PANTRY_NO_CHECKED` reject, and household isolation in `tests/integration/update-pantry.integration.test.ts`
- [x] T010 [P] [US1] Contract tests for `POST /pantry-items/update` (`UpdatePantryRequest` / `UpdatePantryConfirmResponse` including `currentQuantity` + `UPDATE_PANTRY_NO_CHECKED` / `UNIT_MISMATCH` / `VALIDATION_ERROR` / `PANTRY_INVENTORY_FULL`) per `specs/010-update-pantry/contracts/update-pantry.openapi.yaml` in `tests/contract/update-pantry.contract.test.ts`

### Implementation for User Story 1

- [x] T011 [US1] Implement `PantryManagerService.confirmUpdatePantry` in `src/services/pantry-manager-service.ts` (load checked groceries + pantry + ingredients; reject zero checked; project via domain helpers with `removeExpired` default false; apply expired deletes / pantry create-replace / grocery deletes in one SQLite transaction; return `{ items, maxPantryItems, report }`; injectable `householdId` for isolation tests)
- [x] T012 [US1] Add any internal transactional helpers needed on `PantryItemService` / `GroceryItemService` in `src/services/pantry-item-service.ts` / `src/services/grocery-item-service.ts` (batch delete/create/replace for manager) without changing public CRUD/check semantics from `005` / `006`
- [x] T013 [US1] Add Zod transport-only `UpdatePantryRequest` schema (`removeExpired` optional boolean; `additionalProperties: false`) and `POST /pantry-items/update` in `src/api/routes/update-pantry.ts` mapping domain errors
- [x] T014 [US1] Mount update route in `src/api/app.ts` with a `PantryManagerService` instance wired to existing Pantry/Grocery/Ingredient services
- [x] T015 [US1] Ensure successful confirm returns `200` with `items` (same shape as `GET /pantry-items`, A–Z by ingredient display name), `maxPantryItems: 500`, and `report` (`removeExpired`, `applied` with `currentQuantity`/`groceryQuantity`/`resultingQuantity`/`action`, `expiredRemoved`, counts) in `src/api/routes/update-pantry.ts`

**Checkpoint**: US1 MVP — confirm restock from checked groceries works end-to-end

---

## Phase 4: User Story 2 - Preview what confirmation will change (Priority: P2)

**Goal**: Organizer can `POST /pantry-items/update/preview` with the same `removeExpired` flag; response projects create-vs-increase and optional expired removals without mutating pantry or grocery data; preview matches a subsequent confirm for the same inputs (SC-004).

**Independent Test**: Mix of checked/unchecked + known pantry → preview lists only checked lines with actions/quantities; data unchanged after preview; zero checked → empty `applied` (200, not error); confirm after preview yields matching report when no intervening edits.

### Tests for User Story 2

- [x] T016 [US2] Contract tests for `POST /pantry-items/update/preview` (`UpdatePantryPreviewResponse` with `currentQuantity`, empty `applied` when zero checked) per `specs/010-update-pantry/contracts/update-pantry.openapi.yaml` in `tests/contract/update-pantry.contract.test.ts` (append; do not parallel with US1 contract authors)
- [x] T017 [US2] Integration tests for preview read-only (pantry/grocery unchanged), preview↔confirm parity for same checked set + flag (including `currentQuantity`), zero-checked empty `applied` (optional `expiredRemoved` when flag on), in `tests/integration/update-pantry.integration.test.ts` (append; do not parallel with US1 integration authors)
- [x] T018 [P] [US2] Unit tests for preview projection parity with confirm projection helpers (same `removeExpired` false/true inputs; `currentQuantity` after cleanup) in `tests/unit/pantry-manager.test.ts` (append; coordinate if US1 unit author still active)

### Implementation for User Story 2

- [x] T019 [US2] Implement `PantryManagerService.previewUpdatePantry` in `src/services/pantry-manager-service.ts` reusing the same pure projection as confirm with **zero** durable writes; return `{ preview: ApplyReport }`
- [x] T020 [US2] Add `POST /pantry-items/update/preview` in `src/api/routes/update-pantry.ts` with the same Zod `UpdatePantryRequest` body and mount alongside confirm in `src/api/app.ts` if not already covered by T014
- [x] T021 [US2] Ensure preview with zero checked returns `200` and empty `applied` (MAY still project `expiredRemoved` when `removeExpired` true) without calling confirm rejection path in `src/services/pantry-manager-service.ts`

**Checkpoint**: US1 + US2 — confirm + read-only preview independently functional

---

## Phase 5: User Story 3 - Optionally clear expired pantry stock on confirm (Priority: P3)

**Goal**: When `removeExpired: true`, confirm/preview remove expired pantry rows **before** applying purchases; restock of a previously expired Ingredient creates fresh stock (expiration unset); cap evaluated after cleanup; cleanup-only confirm (zero checked) still rejected.

**Independent Test**: Expired + non-expired pantry + checked purchase for expired Ingredient with flag on → expired removed first, purchase creates fresh row; flag off → expired stock remains and may be increased; zero checked + flag on confirm → `UPDATE_PANTRY_NO_CHECKED`.

### Tests for User Story 3

- [x] T022 [US3] Contract tests asserting `expiredRemoved` on confirm/preview when `removeExpired: true` per `specs/010-update-pantry/contracts/update-pantry.openapi.yaml` in `tests/contract/update-pantry.contract.test.ts` (append; do not parallel with earlier contract authors)
- [x] T023 [US3] Integration tests for cleanup-then-apply (expired Ingredient → create fresh), cleanup off leaves expired, today/future/null expiration not removed, cap freed by cleanup allowing creates, and cleanup-only confirm reject in `tests/integration/update-pantry.integration.test.ts` (append; do not parallel with earlier authors)
- [x] T024 [P] [US3] Unit tests for expired UTC boundary (`< today` removed; `>= today` and null kept), cleanup-then-apply create-after-remove, and cap-after-cleanup slot freeing in `tests/unit/pantry-manager.test.ts` (append; coordinate if unit author still active)

### Implementation for User Story 3

- [x] T025 [US3] Ensure confirm/preview honor `removeExpired: true` with cleanup-before-apply ordering and populate `expiredRemoved` in `src/domain/pantry-manager.ts` / `src/services/pantry-manager-service.ts` (extend T005/T011; do not reimplement projection from scratch)
- [x] T026 [US3] Verify/extend T011 cap preflight: evaluates pantry size after expired removals then planned creates; fails atomically with `PANTRY_INVENTORY_FULL` (409) when over 500 in `src/services/pantry-manager-service.ts` (integration coverage in T023)
- [x] T027 [US3] Confirm out-of-scope boundaries remain intact: no meal-cook decrement, no unit conversion, no multi-lot stock, no grocery rebuild, no export in `src/services/pantry-manager-service.ts` / `src/api/routes/update-pantry.ts`

**Checkpoint**: All three user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and operator readiness

- [x] T028 [P] Update root `README.md` with Update Pantry feature pointer and link to `specs/010-update-pantry/quickstart.md`; note that `009` UpdatePantry deferral is delivered here; confirm agent plan pointer is `specs/010-update-pantry/plan.md` in `.cursor/rules/specify-rules.mdc`
- [x] T029 Validate quickstart smoke flows (seed pantry + checked groceries, preview with `removeExpired`, confirm, second confirm reject) per `specs/010-update-pantry/quickstart.md` (use `PUT /grocery-items/:id/checked` for check toggle)
- [x] T030 [P] Run full `npm test` and fix any regressions in update-pantry, pantry-item, grocery-item, build-grocery-list, or related suites
- [x] T031 Confirm PantryItem CRUD and GroceryItem CRUD/check (aside from manager transactional helpers) remain behaviorally unchanged for non-update paths in `src/services/pantry-item-service.ts` / `src/services/grocery-item-service.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately (builds on `001`–`009`)
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; practically needs US1 confirm path for preview↔confirm parity integration
- **User Story 3 (Phase 5)**: Depends on Foundational; extends `removeExpired` behavior on US1/US2 paths
- **Polish (Phase 6)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on other stories — MVP
- **User Story 2 (P2)**: After Foundational; integration builds on US1 endpoint for parity checks
- **User Story 3 (P3)**: After Foundational; cleanup flag completeness on US1/US2 paths

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Domain helpers (Phase 2) before services
- Services before endpoints
- Story complete before moving to next priority when staffing is serial

### Parallel Opportunities

- T001 then T002 [P] in Setup
- T003–T007 foundational mostly sequential on `pantry-manager.ts` / `errors.ts` (T003∥T004 early; T005–T006 sequential on same file; T007 [P] with late foundation)
- US1 tests T008–T010 [P] together before implementation
- After Foundational, US2 unit (T018) can proceed while US1 service work continues if staffed carefully
- Polish T028∥T030 after stories complete

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit tests for create vs increase... in tests/unit/pantry-manager.test.ts"
Task: "Integration tests for confirm create+increase... in tests/integration/update-pantry.integration.test.ts"
Task: "Contract tests for POST /pantry-items/update... in tests/contract/update-pantry.contract.test.ts"

# Then implement service → helpers → route → mount (T011–T015 sequential)
```

---

## Parallel Example: User Story 2

```bash
# After US1 contract file exists, append preview contract/integration serially;
# unit projection parity can run in parallel:
Task: "Unit tests for preview projection parity... in tests/unit/pantry-manager.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test confirm independently
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 confirm → Test independently → MVP
3. Add US2 preview → Test independently
4. Add US3 expired cleanup → Test independently
5. Polish (README, quickstart, full `npm test`)

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2 unit/projection (wire after US1 service exists)
   - Developer C: User Story 3 unit cases (wire after US1 flag plumbing)
3. Stories integrate on shared `pantry-manager` helpers

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Grocery check toggle is `PUT /grocery-items/:id/checked` (not POST)
- Meal-cook decrement, unit conversion, multi-lot stock, grocery rebuild, and export remain out of scope — do not implement in these tasks
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
