# Tasks: Pantry Items

**Input**: Design documents from `/specs/005-pantry-item/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — `plan.md` scopes Vitest unit/integration/contract suites for
pantry CRUD, unit-vs-default checks, Ingredient-in-use delete block, and limits

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing stack and reserve pantry module / test layout

- [x] T001 Verify project layout (`src/domain/`, `src/services/`, `src/api/`, `src/db/`, `tests/{unit,integration,contract}/`) matches `specs/005-pantry-item/plan.md` and create any missing pantry-related directories
- [x] T002 [P] Confirm npm scripts (`dev`, `db:migrate`, `test`) and Vitest config in `package.json` / `vitest.config.ts` support new pantry suites without config changes (adjust only if drift found)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared quantity helper, error codes, and pantry domain validation shared by all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add `UNIT_MISMATCH`, `PANTRY_LIMIT`, `PANTRY_INVENTORY_FULL`, `PANTRY_INGREDIENT_CONFLICT`, and `INGREDIENT_IN_USE` to `ErrorCode` plus helpers (`UNIT_MISMATCH` / `PANTRY_LIMIT` → 400; `PANTRY_INVENTORY_FULL` / `PANTRY_INGREDIENT_CONFLICT` / `INGREDIENT_IN_USE` → 409) in `src/domain/errors.ts`
- [x] T004 [P] Extract `QUANTITY_DECIMAL_PLACES` and `roundQuantity` from `src/domain/recipe.ts` into `src/domain/quantity.ts`; update `src/domain/recipe.ts` to import the shared helper (behavior unchanged)
- [x] T005 [P] Confirm unit catalog reuse via existing `isKnownIngredientUnit` in `src/domain/ingredient-units.ts` (no pantry-only unit list; do not move `GET /ingredient-units` ownership)
- [x] T006 [P] Add `pantry_items` table to Drizzle schema in `src/db/schema.ts` per `specs/005-pantry-item/data-model.md` (household_id, ingredient_id, quantity real, unit_id, nullable expiration_date, timestamps; unique index on `(household_id, ingredient_id)`)
- [x] T007 Create SQLite migration `src/db/migrations/0004_pantry_items.sql` for the `pantry_items` table and ensure `runMigrations` in `src/db/client.ts` / `src/db/migrate.ts` applies it
- [x] T008 Implement PantryItem domain types, constants (inventory cap 500), `parseExpirationDate` (`YYYY-MM-DD` or null; invalid format → `PANTRY_LIMIT`), `normalizePantryItemInput` / `assertPantryItemValid` (positive quantity via `roundQuantity` else `PANTRY_LIMIT`, known unit, unit MUST equal Ingredient `defaultUnitId` else `UNIT_MISMATCH`) in `src/domain/pantry-item.ts`

**Checkpoint**: Foundation ready — schema, quantity helper, and pantry validation available for story work

---

## Phase 3: User Story 1 - Record pantry stock for a catalog ingredient (Priority: P1) 🎯 MVP

**Goal**: Organizer can create a PantryItem for an existing catalog Ingredient with positive quantity (≤3 decimals), unit equal to Ingredient default, and optional expiration; invalid creates leave inventory unchanged; household cap 500 and one-stock-per-Ingredient enforced.

**Independent Test**: With a seeded Ingredient, POST pantry item with matching default unit → reopen shows persisted quantity/unit/expiration/ingredientDisplayName; wrong unit → `UNIT_MISMATCH`; unknown Ingredient → `NOT_FOUND`; non-positive quantity → rejected with no row; duplicate Ingredient → `PANTRY_INGREDIENT_CONFLICT` 409; at 500 items, next create → `PANTRY_INVENTORY_FULL` 409.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Unit tests for quantity rounding (shared helper), expiration parse (`YYYY-MM-DD` / null / invalid → `PANTRY_LIMIT`), and unit-vs-default mismatch (`UNIT_MISMATCH`) in `tests/unit/pantry-item.test.ts`
- [x] T010 [P] [US1] Integration tests for `createPantryItem` success (incl. past expiration), unknown Ingredient (`NOT_FOUND`), `UNIT_MISMATCH`, non-positive quantity → `PANTRY_LIMIT` (no row), duplicate Ingredient conflict, and inventory full: with 500 existing pantry items, create #501 returns `PANTRY_INVENTORY_FULL` / HTTP 409 and leaves count at 500 in `tests/integration/pantry-item.integration.test.ts`
- [x] T011 [P] [US1] Contract tests for `POST /pantry-items` (`CreatePantryItemRequest`) per `specs/005-pantry-item/contracts/pantry-items.openapi.yaml` in `tests/contract/pantry-items.contract.test.ts`

### Implementation for User Story 1

- [x] T012 [US1] Implement `PantryItemService.createPantryItem` in `src/services/pantry-item-service.ts` (load Ingredient, validate unit==defaultUnitId, round quantity, optional expiration, enforce ≤500 and unique ingredientId, persist; default-scoped to `DEFAULT_HOUSEHOLD_ID` but accept injectable `householdId` for isolation tests)
- [x] T013 [US1] Add Zod transport-only `CreatePantryItemRequest` schemas and `POST /pantry-items` in `src/api/routes/pantry-items.ts` mapping domain errors via shared/error mapping pattern from `src/api/routes/ingredients.ts`
- [x] T014 [US1] Mount pantry routes in `src/api/app.ts` with a `PantryItemService` instance (extend `onError` / `mapDomainError` for `UNIT_MISMATCH` / `PANTRY_LIMIT` → 400 and `PANTRY_INGREDIENT_CONFLICT` / `PANTRY_INVENTORY_FULL` / `INGREDIENT_IN_USE` → 409)
- [x] T015 [US1] Ensure successful create returns `201` with full PantryItem body (`ingredientId`, `ingredientDisplayName`, `quantity`, `unitId`, `expirationDate`) in `src/api/routes/pantry-items.ts`

**Checkpoint**: US1 MVP — pantry create works end-to-end

---

## Phase 4: User Story 2 - Browse and view pantry inventory (Priority: P2)

**Goal**: Organizer can list household pantry A–Z by Ingredient display name (case-insensitive) and open pantry detail; empty pantry is valid.

**Independent Test**: With ≥2 seeded pantry items, GET list shows distinguishable entries ordered A–Z by `ingredientDisplayName` with quantity/unit; GET detail matches saved fields; empty DB returns empty `items` and `maxPantryItems: 500`.

### Tests for User Story 2

- [x] T016 [US2] Contract tests for `GET /pantry-items` and `GET /pantry-items/{pantryItemId}` in `tests/contract/pantry-items.contract.test.ts` (append; do not parallel with US1 contract authors)
- [x] T017 [US2] Integration tests for list (including empty + A–Z by Ingredient display name) and get detail in `tests/integration/pantry-item.integration.test.ts` (append; do not parallel with US1 integration authors)

### Implementation for User Story 2

- [x] T018 [US2] Implement `listPantryItems` (join Ingredient display names; case-insensitive A–Z by `ingredientDisplayName`) and `getPantryItem` on `src/services/pantry-item-service.ts` scoped to household
- [x] T019 [US2] Implement `GET /pantry-items` and `GET /pantry-items/{pantryItemId}` in `src/api/routes/pantry-items.ts` per `specs/005-pantry-item/contracts/pantry-items.openapi.yaml`
- [x] T020 [US2] Ensure list response includes `maxPantryItems: 500` and `404` for missing pantry item ids in `src/api/routes/pantry-items.ts`

**Checkpoint**: US1 + US2 — create, list A–Z, and view work independently

---

## Phase 5: User Story 3 - Update or remove pantry stock (Priority: P2)

**Goal**: Organizer can full-replace pantry fields (required `quantity` + `unitId` + `expirationDate` on PUT; `null` clears expiration; last-write-wins) or permanently delete stock; Ingredient catalog delete is blocked while pantry stock references that Ingredient (`INGREDIENT_IN_USE`).

**Independent Test**: PUT changes quantity/unit/expiration → reopen shows only new values; PUT with `expirationDate: null` clears; PUT omitting any of quantity/unitId/expirationDate → `VALIDATION_ERROR` and prior unchanged; PUT including `ingredientId` → `VALIDATION_ERROR` prior unchanged; unit ≠ current Ingredient default → `UNIT_MISMATCH` prior unchanged; after Ingredient default-unit change, PUT with old unit → `UNIT_MISMATCH`; DELETE pantry → absent from list; DELETE Ingredient while stocked → `INGREDIENT_IN_USE` 409; after pantry delete, Ingredient delete succeeds.

### Tests for User Story 3

- [x] T021 [US3] Contract tests for `PUT /pantry-items/{pantryItemId}` (`ReplacePantryItemRequest`) and `DELETE /pantry-items/{pantryItemId}` in `tests/contract/pantry-items.contract.test.ts` (append; do not parallel with earlier contract authors)
- [x] T022 [US3] Contract/integration coverage for Ingredient `DELETE /ingredients/{ingredientId}` returning `409 INGREDIENT_IN_USE` when pantry stock exists — update `tests/contract/ingredients.contract.test.ts` and/or append to `tests/integration/pantry-item.integration.test.ts` (and assert OpenAPI enum in `specs/004-ingredient/contracts/ingredients.openapi.yaml` already documents the code)
- [x] T023 [US3] Integration tests for replace success, clear expiration via `null`, omit required replace fields → `VALIDATION_ERROR` (prior unchanged), unit mismatch on replace, Ingredient `defaultUnitId` change then PUT with stale unit → `UNIT_MISMATCH` (prior unchanged), permanent pantry delete, delete-not-found, and Ingredient-in-use block in `tests/integration/pantry-item.integration.test.ts` (append; do not parallel with earlier authors)

### Implementation for User Story 3

- [x] T024 [US3] Implement `replacePantryItem` (full replace requiring `quantity` + `unitId` + `expirationDate`; `null` clears expiration; re-check unit against Ingredient current `defaultUnitId`; last successful write wins) and `deletePantryItem` (permanent) on `src/services/pantry-item-service.ts`
- [x] T025 [US3] Implement `PUT /pantry-items/{pantryItemId}` (Zod `ReplacePantryItemRequest`) and `DELETE /pantry-items/{pantryItemId}` (`204` on success) in `src/api/routes/pantry-items.ts`
- [x] T026 [US3] Update `IngredientService.deleteIngredient` in `src/services/ingredient-service.ts` to query `pantry_items` and raise `INGREDIENT_IN_USE` (409) when stock exists; leave pantry rows unchanged (no cascade)
- [x] T027 [US3] Reject PUT bodies that include `ingredientId` with `VALIDATION_ERROR` (immutable Ingredient linkage; do not silently ignore) and confirm PantryItem identity stays stable across quantity changes in `src/services/pantry-item-service.ts` / `src/api/routes/pantry-items.ts` / Zod `ReplacePantryItemRequest`

**Checkpoint**: US1–US3 — full pantry CRUD + Ingredient-in-use guard independently functional

---

## Phase 6: User Story 4 - Spot soon-to-expire stock (Priority: P3)

**Goal**: Expiration dates (including past/today) are visible on list/detail; expired items are never auto-removed; items without expiration still list normally.

**Independent Test**: Seed items with future, today/past, and null expiration → list/detail show dates as stored; no silent deletion of past dates; null expiration displays as unset.

### Tests for User Story 4

- [x] T028 [P] [US4] Unit tests confirming past/today/future expiration dates are accepted and invalid date strings rejected in `tests/unit/pantry-item.test.ts` (append; coordinate if US1 unit author still active)
- [x] T029 [US4] Integration tests for list/detail visibility of past and null expirations and assert no auto-delete of expired rows in `tests/integration/pantry-item.integration.test.ts` (append; do not parallel with earlier authors)
- [x] T030 [US4] Integration test: two `PantryItemService` instances (or constructor `householdId` overrides) prove pantry items created in household A never appear in list/get for household B (FR-010) in `tests/integration/pantry-item.integration.test.ts` (append; do not parallel with earlier authors)

### Implementation for User Story 4

- [x] T031 [US4] Confirm list/get responses always surface `expirationDate` (including past dates and `null`) without filtering or purge logic in `src/services/pantry-item-service.ts` / `src/api/routes/pantry-items.ts`
- [x] T032 [US4] Confirm out-of-scope boundaries remain intact: no UpdatePantry auto-adjust, no grocery subtraction, no multi-lot stock, no unit conversion in `src/api/routes/pantry-items.ts` / `src/services/pantry-item-service.ts`

**Checkpoint**: All four user stories independently functional; expiration visibility + household isolation verified

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and operator readiness

- [x] T033 [P] Update root `README.md` with Pantry Items feature pointer and link to `specs/005-pantry-item/quickstart.md`; confirm agent plan pointer is `specs/005-pantry-item/plan.md`
- [x] T034 Validate quickstart smoke flows (create Ingredient, create pantry, list A–Z, get, replace/clear expiration, unit mismatch, duplicate conflict, Ingredient-in-use delete, pantry then Ingredient delete, restart persistence) per `specs/005-pantry-item/quickstart.md`
- [x] T035 [P] Run full `npm test` and fix any regressions in pantry, ingredient, recipe, preference, or family-member suites
- [x] T036 Confirm recipe free-text ingredient lines and Ingredient catalog CRUD (aside from delete-in-use guard) remain unchanged in `src/domain/recipe.ts` / `src/services/ingredient-service.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately (builds on `001`–`004`)
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; uses created pantry items from US1 for demos but is independently testable with seeded rows
- **User Story 3 (Phase 5)**: Depends on Foundational; needs existing pantry rows (seed in tests); Ingredient-in-use depends on US1 create path existing
- **User Story 4 (Phase 6)**: Depends on Foundational; hardens expiration visibility on list/get and verifies FR-010 isolation
- **Polish (Phase 7)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on US2–US4
- **User Story 2 (P2)**: After Foundational — independently testable with seeded pantry items
- **User Story 3 (P2)**: After Foundational — independently testable with seeded pantry items; Ingredient-in-use needs pantry rows
- **User Story 4 (P3)**: After Foundational — independently testable via list/get assertions; practically follows US1/US2 paths

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Domain/service before endpoints
- Story complete before moving to next priority (or parallelize if staffed)

### Parallel Opportunities

- T001–T002 setup can proceed together
- T003, T004, T005, T006 are [P] within Foundational (different files); T007 depends on T006; T008 depends on T003/T004/T005
- T009–T011 US1 tests can run in parallel (different files)
- T016/T017/T021/T022/T023/T029/T030 append shared contract/integration files — **not** parallel with each other or with T010/T011 authors
- T028 may append `pantry-item.test.ts` — coordinate with T009
- After Foundational, US1/US2/US3 can proceed in parallel if capacity allows (watch shared files: `pantry-item-service.ts`, `pantry-items.ts`, `app.ts`, `ingredient-service.ts`)

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Unit tests in tests/unit/pantry-item.test.ts"
Task: "Integration tests in tests/integration/pantry-item.integration.test.ts"
Task: "Contract tests for POST /pantry-items in tests/contract/pantry-items.contract.test.ts"

# Then implement sequentially (shared service/route files):
Task: "PantryItemService.createPantryItem in src/services/pantry-item-service.ts"
Task: "POST /pantry-items in src/api/routes/pantry-items.ts"
Task: "Mount routes in src/api/app.ts"
```

---

## Parallel Example: User Story 2

```bash
# After US1 contract/integration authors finish (shared files):
Task: "Contract tests for GET list/detail (append)"
Task: "Integration tests for list A–Z / get (append)"

# Implementation:
Task: "listPantryItems + getPantryItem in src/services/pantry-item-service.ts"
Task: "GET endpoints in src/api/routes/pantry-items.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Create + validation independently
5. Demo via POST; proceed to US2 for browse A–Z

### Incremental Delivery

1. Setup + Foundational → schema, quantity helper, validate ready
2. US1 → create pantry stock (MVP)
3. US2 → list A–Z / view
4. US3 → replace (incl. clear expiration) + permanent delete + Ingredient-in-use
5. US4 → expiration visibility + household isolation
6. Polish → quickstart + README + full test run

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2 (coordinate on `pantry-items.ts` / `pantry-item-service.ts`)
   - Developer C: User Story 3 (coordinate on same shared files + `ingredient-service.ts`)
   - Developer D: User Story 4 assertions after list/get paths exist
3. Merge carefully around `src/api/routes/pantry-items.ts`, `src/services/pantry-item-service.ts`, `src/services/ingredient-service.ts`, and `src/api/app.ts`

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Do not implement UpdatePantry, grocery subtraction, multi-lot stock, or unit conversion
- Do not add p95/sub-200ms latency gates in this feature (plan stretch target only — SC-002 is a manual UX outcome, not a load harness)
- SC-002 and SC-004 are manual UX outcomes validated during T034 quickstart / organizer demos; do not add automated timing or findability harnesses
- Field/format limits: omit required fields → `VALIDATION_ERROR` (400); non-finite/≤0 quantity or invalid `YYYY-MM-DD` → `PANTRY_LIMIT` (400); inventory at 500 → `PANTRY_INVENTORY_FULL` (409); duplicate Ingredient → `PANTRY_INGREDIENT_CONFLICT` (409); Ingredient delete while stocked → `INGREDIENT_IN_USE` (409); wrong unit vs default → `UNIT_MISMATCH` (400); unknown unit → `UNKNOWN_UNIT` (400)
- Units MUST equal Ingredient `defaultUnitId` and reuse `src/domain/ingredient-units.ts`
- PUT requires `quantity` + `unitId` + `expirationDate`; `null` clears expiration; omit → `VALIDATION_ERROR`
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
