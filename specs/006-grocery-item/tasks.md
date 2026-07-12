# Tasks: Grocery Items

**Input**: Design documents from `/specs/006-grocery-item/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — `plan.md` scopes Vitest unit/integration/contract suites for
grocery CRUD, check toggle, category grouping/sort, unit-vs-default checks,
Ingredient-in-use delete block (grocery + pantry), and limits

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing stack and reserve grocery module / test layout

- [x] T001 Verify project layout (`src/domain/`, `src/services/`, `src/api/`, `src/db/`, `tests/{unit,integration,contract}/`) matches `specs/006-grocery-item/plan.md` and create any missing grocery-related directories
- [x] T002 [P] Confirm npm scripts (`dev`, `db:migrate`, `test`) and Vitest config in `package.json` / `vitest.config.ts` support new grocery suites without config changes (adjust only if drift found)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, error codes, and grocery domain validation shared by all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add `GROCERY_LIMIT`, `GROCERY_LIST_FULL`, and `GROCERY_INGREDIENT_CONFLICT` to `ErrorCode` plus helpers (`GROCERY_LIMIT` → 400; `GROCERY_LIST_FULL` / `GROCERY_INGREDIENT_CONFLICT` → 409) in `src/domain/errors.ts` (reuse existing `UNIT_MISMATCH`, `UNKNOWN_UNIT`, `INGREDIENT_IN_USE`, `VALIDATION_ERROR`, `NOT_FOUND`)
- [x] T004 [P] Confirm shared `QUANTITY_DECIMAL_PLACES` / `roundQuantity` in `src/domain/quantity.ts` are available for grocery (do not re-extract from recipe; import only)
- [x] T005 [P] Confirm unit catalog reuse via existing `isKnownIngredientUnit` in `src/domain/ingredient-units.ts` and shopping-category catalog order via `SHOPPING_CATEGORIES` in `src/domain/shopping-categories.ts` (no grocery-only catalogs; `other` is last)
- [x] T006 [P] Add `grocery_items` table to Drizzle schema in `src/db/schema.ts` per `specs/006-grocery-item/data-model.md` (household_id, ingredient_id, quantity real, unit_id, checked integer 0/1 default 0, timestamps; unique index on `(household_id, ingredient_id)`)
- [x] T007 Create SQLite migration `src/db/migrations/0005_grocery_items.sql` for the `grocery_items` table and ensure `runMigrations` in `src/db/client.ts` / `src/db/migrate.ts` applies it
- [x] T008 Implement GroceryItem domain types, constants (list cap 500), `normalizeGroceryItemCreateInput` / `assertGroceryItemQuantityUnitValid` (positive quantity via `roundQuantity` else `GROCERY_LIMIT`, known unit, unit MUST equal Ingredient `defaultUnitId` else `UNIT_MISMATCH`), and helpers for effective category (`shoppingCategoryId ?? "other"`) in `src/domain/grocery-item.ts`

**Checkpoint**: Foundation ready — schema and grocery validation available for story work

---

## Phase 3: User Story 1 - Add a grocery line for a catalog ingredient (Priority: P1) 🎯 MVP

**Goal**: Organizer can create a GroceryItem for an existing catalog Ingredient with positive quantity (≤3 decimals) and unit equal to Ingredient default; new lines start unchecked; invalid creates leave the list unchanged; household cap 500 and one-line-per-Ingredient enforced.

**Independent Test**: With a seeded Ingredient, POST grocery item with matching default unit → reopen shows persisted quantity/unit/`checked: false`/ingredientDisplayName/effective category; wrong unit → `UNIT_MISMATCH`; unknown Ingredient → `NOT_FOUND`; non-positive quantity → rejected with no row; duplicate Ingredient → `GROCERY_INGREDIENT_CONFLICT` 409; at 500 items, next create → `GROCERY_LIST_FULL` 409; body including `checked` on create → `VALIDATION_ERROR`.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Unit tests for quantity rounding (shared helper), unit-vs-default mismatch (`UNIT_MISMATCH`), and effective category (`null` → `"other"`) in `tests/unit/grocery-item.test.ts`
- [x] T010 [P] [US1] Integration tests for `createGroceryItem` success (starts unchecked), unknown Ingredient (`NOT_FOUND`), `UNIT_MISMATCH`, non-positive quantity → `GROCERY_LIMIT` (no row), create with `checked` in body → `VALIDATION_ERROR`, duplicate Ingredient conflict, and list full: with 500 existing grocery items, create #501 returns `GROCERY_LIST_FULL` / HTTP 409 and leaves count at 500 in `tests/integration/grocery-item.integration.test.ts`
- [x] T011 [P] [US1] Contract tests for `POST /grocery-items` (`CreateGroceryItemRequest`) per `specs/006-grocery-item/contracts/grocery-items.openapi.yaml` in `tests/contract/grocery-items.contract.test.ts`

### Implementation for User Story 1

- [x] T012 [US1] Implement `GroceryItemService.createGroceryItem` in `src/services/grocery-item-service.ts` (load Ingredient, validate unit==defaultUnitId, round quantity, reject body `checked`, enforce ≤500 and unique ingredientId, persist with `checked=false`; default-scoped to `DEFAULT_HOUSEHOLD_ID` but accept injectable `householdId` for isolation tests)
- [x] T013 [US1] Add Zod transport-only `CreateGroceryItemRequest` schemas and `POST /grocery-items` in `src/api/routes/grocery-items.ts` mapping domain errors via shared/error mapping pattern from `src/api/routes/pantry-items.ts`
- [x] T014 [US1] Mount grocery routes in `src/api/app.ts` with a `GroceryItemService` instance (extend `onError` / `mapDomainError` for `GROCERY_LIMIT` → 400 and `GROCERY_INGREDIENT_CONFLICT` / `GROCERY_LIST_FULL` → 409; reuse `UNIT_MISMATCH` / `INGREDIENT_IN_USE` mappings)
- [x] T015 [US1] Ensure successful create returns `201` with full GroceryItem body (`ingredientId`, `ingredientDisplayName`, `shoppingCategoryId`, `shoppingCategoryLabel`, `quantity`, `unitId`, `checked: false`) in `src/api/routes/grocery-items.ts`

**Checkpoint**: US1 MVP — grocery create works end-to-end

---

## Phase 4: User Story 2 - Browse and view the shopping list (Priority: P2)

**Goal**: Organizer can list household grocery items grouped by effective shopping category (catalog order; unset → Other; Other last) with A–Z Ingredient name within groups regardless of checked status, and open grocery detail; empty list is valid.

**Independent Test**: With ≥2 seeded grocery items in different categories, GET list returns nested `groups` in `SHOPPING_CATEGORIES` order with distinguishable entries, quantities/units/check status, and A–Z within groups; GET detail matches saved fields; empty DB returns empty `groups` and `maxGroceryItems: 500`.

### Tests for User Story 2

- [x] T016 [US2] Contract tests for `GET /grocery-items` and `GET /grocery-items/{groceryItemId}` in `tests/contract/grocery-items.contract.test.ts` (append; do not parallel with US1 contract authors)
- [x] T017 [US2] Integration tests for list (including empty; catalog group order with dairy before dry_goods; A–Z within group; null Ingredient category → Other group last) and get detail in `tests/integration/grocery-item.integration.test.ts` (append; do not parallel with US1 integration authors)
- [x] T018 [P] [US2] Unit tests for group ordering helper (catalog order, Other last, omit empty groups, A–Z within group ignoring checked) in `tests/unit/grocery-item.test.ts` (append; coordinate if US1 unit author still active)

### Implementation for User Story 2

- [x] T019 [US2] Implement `listGroceryItems` (join Ingredient; effective category; group by catalog order; A–Z within group case-insensitive regardless of checked) and `getGroceryItem` on `src/services/grocery-item-service.ts` scoped to household
- [x] T020 [US2] Implement `GET /grocery-items` and `GET /grocery-items/{groceryItemId}` in `src/api/routes/grocery-items.ts` per `specs/006-grocery-item/contracts/grocery-items.openapi.yaml`
- [x] T021 [US2] Ensure list response includes `groups` + `maxGroceryItems: 500` and `404` for missing grocery item ids in `src/api/routes/grocery-items.ts`

**Checkpoint**: US1 + US2 — create, grouped list, and view work independently

---

## Phase 5: User Story 3 - Update quantity or remove a grocery line (Priority: P2)

**Goal**: Organizer can full-replace grocery quantity/unit (required on PUT; checked unchanged; last-write-wins) or permanently delete a line; Ingredient catalog delete is blocked while a grocery line references that Ingredient (`INGREDIENT_IN_USE`, in addition to existing pantry check).

**Independent Test**: PUT changes quantity/unit → reopen shows new values and prior checked status; PUT omitting quantity or unitId → `VALIDATION_ERROR` and prior unchanged; PUT including `ingredientId` or `checked` → `VALIDATION_ERROR` prior unchanged; unit ≠ current Ingredient default → `UNIT_MISMATCH` prior unchanged; after Ingredient default-unit change, PUT with old unit → `UNIT_MISMATCH`; DELETE grocery → absent from list; DELETE Ingredient while listed → `INGREDIENT_IN_USE` 409; after grocery delete (and no pantry row), Ingredient delete succeeds.

### Tests for User Story 3

- [x] T022 [US3] Contract tests for `PUT /grocery-items/{groceryItemId}` (`ReplaceGroceryItemRequest`) and `DELETE /grocery-items/{groceryItemId}` in `tests/contract/grocery-items.contract.test.ts` (append; do not parallel with earlier contract authors)
- [x] T023 [US3] Contract/integration coverage for Ingredient `DELETE /ingredients/{ingredientId}` returning `409 INGREDIENT_IN_USE` when a grocery line exists — append to `tests/integration/grocery-item.integration.test.ts` and/or update `tests/contract/ingredients.contract.test.ts` (OpenAPI enum in `specs/004-ingredient/contracts/ingredients.openapi.yaml` already documents the code)
- [x] T024 [US3] Integration tests for replace success (checked unchanged), omit required replace fields → `VALIDATION_ERROR` (prior unchanged), PUT with `checked` or `ingredientId` → `VALIDATION_ERROR`, unit mismatch on replace, Ingredient `defaultUnitId` change then PUT with stale unit → `UNIT_MISMATCH` (prior unchanged), permanent grocery delete, delete-not-found, and Ingredient-in-use block in `tests/integration/grocery-item.integration.test.ts` (append; do not parallel with earlier authors)

### Implementation for User Story 3

- [x] T025 [US3] Implement `replaceGroceryItem` (full replace requiring `quantity` + `unitId`; leave checked unchanged; re-check unit against Ingredient current `defaultUnitId`; last successful write wins) and `deleteGroceryItem` (permanent) on `src/services/grocery-item-service.ts`
- [x] T026 [US3] Implement `PUT /grocery-items/{groceryItemId}` (Zod `ReplaceGroceryItemRequest` with `additionalProperties: false` / reject `checked` + `ingredientId`) and `DELETE /grocery-items/{groceryItemId}` (`204` on success) in `src/api/routes/grocery-items.ts`
- [x] T027 [US3] Export `assertIngredientNotInGrocery` from `src/services/grocery-item-service.ts` and update `IngredientService.deleteIngredient` in `src/services/ingredient-service.ts` to call it (alongside existing `assertIngredientNotInPantry`); raise `INGREDIENT_IN_USE` (409) when a grocery row exists; leave grocery rows unchanged (no cascade)
- [x] T028 [US3] Confirm GroceryItem identity stays stable across quantity changes and that successful replace does not mutate `checked` in `src/services/grocery-item-service.ts` / `src/api/routes/grocery-items.ts`

**Checkpoint**: US1–US3 — full grocery CRUD + Ingredient-in-use guard independently functional

---

## Phase 6: User Story 4 - Check off purchased items (Priority: P2)

**Goal**: Organizer can mark a grocery item purchased or clear the check via dedicated `PUT .../checked` without changing quantity/unit/Ingredient; checked items remain on the list in A–Z order; no bulk clear.

**Independent Test**: PUT checked true → list/detail show checked with quantity unchanged; PUT checked false → unchecked again; list A–Z order within group unchanged by check status; PUT .../checked with quantity in body → `VALIDATION_ERROR`; full replace still cannot change checked.

### Tests for User Story 4

- [x] T029 [US4] Contract tests for `PUT /grocery-items/{groceryItemId}/checked` (`SetGroceryItemCheckedRequest`) in `tests/contract/grocery-items.contract.test.ts` (append; do not parallel with earlier contract authors)
- [x] T030 [US4] Integration tests for check/uncheck success (quantity/unit unchanged), invalid checked body (missing checked / extra quantity) → `VALIDATION_ERROR` prior unchanged, list order unchanged after check, and household isolation (grocery items in household A never appear in list/get for household B) in `tests/integration/grocery-item.integration.test.ts` (append; do not parallel with earlier authors)

### Implementation for User Story 4

- [x] T031 [US4] Implement `setGroceryItemChecked` on `src/services/grocery-item-service.ts` (require boolean `checked`; reject extra quantity/unit/ingredientId; bump `updatedAt`; last successful toggle wins)
- [x] T032 [US4] Implement `PUT /grocery-items/{groceryItemId}/checked` in `src/api/routes/grocery-items.ts` per OpenAPI (`SetGroceryItemCheckedRequest`, `additionalProperties: false`)
- [x] T033 [US4] Confirm out-of-scope boundaries remain intact: no bulk remove/uncheck, no BuildGroceryList generation, no pantry subtraction, no UpdatePantry, no export, no quantity-merge on duplicate create in `src/api/routes/grocery-items.ts` / `src/services/grocery-item-service.ts`

**Checkpoint**: All four user stories independently functional; check toggle + household isolation verified

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and operator readiness

- [x] T034 [P] Update root `README.md` with Grocery Items feature pointer and link to `specs/006-grocery-item/quickstart.md`; confirm agent plan pointer is `specs/006-grocery-item/plan.md`
- [x] T035 Validate quickstart smoke flows (create Ingredients, create grocery lines, list groups in catalog order, get, replace quantity/unit, check toggle, unit mismatch, duplicate conflict, Ingredient-in-use delete, grocery then Ingredient delete, restart persistence) per `specs/006-grocery-item/quickstart.md`
- [x] T036 [P] Run full `npm test` and fix any regressions in grocery, pantry, ingredient, recipe, preference, or family-member suites
- [x] T037 Confirm pantry CRUD and Ingredient catalog CRUD (aside from delete-in-use guard now covering grocery + pantry) remain unchanged in `src/services/pantry-item-service.ts` / `src/domain/ingredient.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately (builds on `001`–`005`)
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; uses created grocery items from US1 for demos but is independently testable with seeded rows
- **User Story 3 (Phase 5)**: Depends on Foundational; needs existing grocery rows (seed in tests); Ingredient-in-use depends on US1 create path existing
- **User Story 4 (Phase 6)**: Depends on Foundational; needs existing grocery rows; check toggle is independently testable once create exists
- **Polish (Phase 7)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on US2–US4
- **User Story 2 (P2)**: After Foundational — independently testable with seeded grocery items
- **User Story 3 (P2)**: After Foundational — independently testable with seeded grocery items; Ingredient-in-use needs grocery rows
- **User Story 4 (P2)**: After Foundational — independently testable with seeded grocery items; practically follows US1 create path

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Domain/service before endpoints
- Story complete before moving to next priority (or parallelize if staffed)

### Parallel Opportunities

- T001–T002 setup can proceed together
- T003, T004, T005, T006 are [P] within Foundational (different files); T007 depends on T006; T008 depends on T003/T004/T005
- T009–T011 US1 tests can run in parallel (different files)
- T016/T017/T022/T023/T024/T029/T030 append shared contract/integration files — **not** parallel with each other or with T010/T011 authors
- T018 may append `grocery-item.test.ts` — coordinate with T009
- After Foundational, US1/US2/US3/US4 can proceed in parallel if capacity allows (watch shared files: `grocery-item-service.ts`, `grocery-items.ts`, `app.ts`, `ingredient-service.ts`)

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Unit tests in tests/unit/grocery-item.test.ts"
Task: "Integration tests in tests/integration/grocery-item.integration.test.ts"
Task: "Contract tests for POST /grocery-items in tests/contract/grocery-items.contract.test.ts"

# Then implement sequentially (shared service/route files):
Task: "GroceryItemService.createGroceryItem in src/services/grocery-item-service.ts"
Task: "POST /grocery-items in src/api/routes/grocery-items.ts"
Task: "Mount routes in src/api/app.ts"
```

---

## Parallel Example: User Story 2

```bash
# After US1 contract/integration authors finish (shared files):
Task: "Contract tests for GET list/detail (append)"
Task: "Integration tests for grouped list / get (append)"

# Implementation:
Task: "listGroceryItems + getGroceryItem in src/services/grocery-item-service.ts"
Task: "GET endpoints in src/api/routes/grocery-items.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Create + validation independently
5. Demo via POST; proceed to US2 for grouped browse

### Incremental Delivery

1. Setup + Foundational → schema + validate ready
2. US1 → create grocery line (MVP)
3. US2 → grouped list / view
4. US3 → replace quantity/unit + permanent delete + Ingredient-in-use
5. US4 → dedicated check toggle + household isolation
6. Polish → quickstart + README + full test run

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2 (coordinate on `grocery-items.ts` / `grocery-item-service.ts`)
   - Developer C: User Story 3 (coordinate on same shared files + `ingredient-service.ts`)
   - Developer D: User Story 4 after create path exists
3. Merge carefully around `src/api/routes/grocery-items.ts`, `src/services/grocery-item-service.ts`, `src/services/ingredient-service.ts`, and `src/api/app.ts`

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Do not implement BuildGroceryList, pantry subtraction, UpdatePantry, export, bulk clear checked, quantity-merge on duplicate create, or unit conversion
- Do not add p95/sub-200ms latency gates in this feature (plan stretch target only — SC-002 is a manual UX outcome, not a load harness)
- SC-002 and SC-004 are manual UX outcomes validated during T035 quickstart / organizer demos; do not add automated timing or findability harnesses
- Field/format limits: omit required fields → `VALIDATION_ERROR` (400); create or
  PUT replace including `checked` → `VALIDATION_ERROR` (400); non-finite/≤0
  quantity → `GROCERY_LIMIT` (400); list at 500 → `GROCERY_LIST_FULL` (409);
  duplicate Ingredient → `GROCERY_INGREDIENT_CONFLICT` (409); Ingredient delete
  while listed → `INGREDIENT_IN_USE` (409); wrong unit vs default →
  `UNIT_MISMATCH` (400); unknown unit → `UNKNOWN_UNIT` (400)
- Units MUST equal Ingredient `defaultUnitId` and reuse `src/domain/ingredient-units.ts`
- PUT replace requires `quantity` + `unitId` only; including `checked` or
  `ingredientId` → `VALIDATION_ERROR`; checked changes only via `PUT .../checked`
  (FR-002 omit rules do not apply to the check-toggle path)
- Canonical API field is `checked` (“purchased” is user-facing synonym only)
- Delete confirmation is UI-only; no confirm API in this feature
- List groups follow `SHOPPING_CATEGORIES` order; effective category
  `ingredient.shoppingCategoryId ?? "other"`; A–Z within group ignores checked
  (FR-015 owns grouping/sort detail; FR-005 is list/get capability)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
