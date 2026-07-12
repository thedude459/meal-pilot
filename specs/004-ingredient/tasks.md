# Tasks: Ingredients

**Input**: Design documents from `/specs/004-ingredient/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — `plan.md` scopes Vitest unit/integration/contract suites for
ingredient CRUD, shopping-category catalog, label uniqueness, and limits

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing stack and reserve ingredient module / test layout

- [x] T001 Verify project layout (`src/domain/`, `src/services/`, `src/api/`, `src/db/`, `tests/{unit,integration,contract}/`) matches `specs/004-ingredient/plan.md` and create any missing ingredient-related directories
- [x] T002 [P] Confirm npm scripts (`dev`, `db:migrate`, `test`) and Vitest config in `package.json` / `vitest.config.ts` support new ingredient suites without config changes (adjust only if drift found)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shopping-category catalog, error codes, and ingredient domain normalization shared by all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add `UNKNOWN_SHOPPING_CATEGORY`, `INGREDIENT_LIMIT`, `INGREDIENT_CATALOG_FULL`, and `INGREDIENT_LABEL_CONFLICT` to `ErrorCode` plus `unknownShoppingCategoryError` / `ingredientLimitError` / `ingredientCatalogFullError` / `ingredientLabelConflictError` helpers (`INGREDIENT_LIMIT` → 400; `UNKNOWN_SHOPPING_CATEGORY` → 400; `INGREDIENT_CATALOG_FULL` / `INGREDIENT_LABEL_CONFLICT` → 409) in `src/domain/errors.ts`
- [x] T004 [P] Implement predefined shopping-category catalog (`listShoppingCategories`, `isKnownShoppingCategory`) with ids/labels from `specs/004-ingredient/research.md` §6 in `src/domain/shopping-categories.ts`
- [x] T005 [P] Confirm unit catalog reuse via existing `isKnownIngredientUnit` / `listIngredientUnits` in `src/domain/ingredient-units.ts` (no second unit list; do not move `GET /ingredient-units` ownership away from `src/api/routes/recipes.ts`)
- [x] T006 [P] Add `ingredients` table to Drizzle schema in `src/db/schema.ts` per `specs/004-ingredient/data-model.md` (household_id, display_name, display_name_key, default_unit_id, nullable shopping_category_id, aliases JSON, timestamps; unique index on `(household_id, display_name_key)` parallel to family-members)
- [x] T007 Create SQLite migration `src/db/migrations/0003_ingredients.sql` for the `ingredients` table and ensure `runMigrations` in `src/db/client.ts` / `src/db/migrate.ts` applies it
- [x] T008 Implement Ingredient domain types, constants (name/alias ≤80, ≤20 aliases, catalog cap 500), `normalizeIngredientLabel` (trim + collapse Unicode `\s` to one ASCII space), `normalizeIngredientInput`, and `assertIngredientValid` (unit + shopping-category checks; alias blank-drop + case-insensitive first-seen collapse; reject alias = display name) in `src/domain/ingredient.ts`

**Checkpoint**: Foundation ready — schema, catalogs, and ingredient validation available for story work

---

## Phase 3: User Story 1 - Add an ingredient to the household catalog (Priority: P1) 🎯 MVP

**Goal**: Organizer can create a catalog Ingredient with normalized display name, required default unit, and optional shopping category; invalid creates leave the catalog unchanged; household cap 500 enforced.

**Independent Test**: POST ingredient with name + unit → reopen shows persisted normalized name/unit/category; unknown unit → `UNKNOWN_UNIT`; unknown category → `UNKNOWN_SHOPPING_CATEGORY`; blank name → rejected with no row; duplicate normalized name → `INGREDIENT_LABEL_CONFLICT` 409; at 500 ingredients, next create → `INGREDIENT_CATALOG_FULL` 409.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Unit tests for label normalize (trim + collapse Unicode `\s` whitespace), limits, blank rejection, and shopping-category membership helpers in `tests/unit/ingredient.test.ts`
- [x] T010 [P] [US1] Unit tests for shopping-category catalog membership in `tests/unit/shopping-categories.test.ts`
- [x] T011 [P] [US1] Integration tests for `createIngredient` success (normalized name), unknown unit, unknown shopping category, validation failure (no row), label conflict, and catalog full: with 500 existing ingredients, create #501 returns `INGREDIENT_CATALOG_FULL` / HTTP 409 and leaves count at 500 in `tests/integration/ingredient.integration.test.ts`
- [x] T012 [P] [US1] Contract tests for `POST /ingredients` (`CreateIngredientRequest`) per `specs/004-ingredient/contracts/ingredients.openapi.yaml` in `tests/contract/ingredients.contract.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Implement `IngredientService.createIngredient` in `src/services/ingredient-service.ts` (normalize + validate, household label uniqueness check, enforce ≤500 with `ingredientCatalogFullError`, persist; default-scoped to `DEFAULT_HOUSEHOLD_ID` but accept injectable `householdId` for isolation tests)
- [x] T014 [US1] Add Zod transport-only `CreateIngredientRequest` schemas and `POST /ingredients` in `src/api/routes/ingredients.ts` mapping domain errors via shared/error mapping pattern from `src/api/routes/family-members.ts`
- [x] T015 [US1] Mount ingredient routes in `src/api/app.ts` with an `IngredientService` instance (extend `onError` / `mapDomainError` for `UNKNOWN_SHOPPING_CATEGORY` / `INGREDIENT_LIMIT` → 400 and `INGREDIENT_LABEL_CONFLICT` / `INGREDIENT_CATALOG_FULL` → 409)
- [x] T016 [US1] Ensure successful create returns `201` with full Ingredient body (normalized `displayName`, `defaultUnitId`, `shoppingCategoryId`, `aliases`) in `src/api/routes/ingredients.ts`

**Checkpoint**: US1 MVP — ingredient create works end-to-end

---

## Phase 4: User Story 2 - Browse and view the ingredient catalog (Priority: P2)

**Goal**: Organizer can list the household catalog A–Z (case-insensitive) and open ingredient detail; empty catalog is valid; shopping-category catalog is listable.

**Independent Test**: With ≥2 seeded ingredients, GET list shows distinguishable entries ordered A–Z by display name; GET detail matches saved fields; empty DB returns empty `items`; GET shopping-categories returns catalog id+label.

### Tests for User Story 2

- [x] T017 [US2] Contract tests for `GET /ingredients`, `GET /ingredients/{ingredientId}`, and `GET /shopping-categories` in `tests/contract/ingredients.contract.test.ts` (append; do not parallel with US1 contract authors)
- [x] T018 [US2] Integration tests for list (including empty + A–Z order), get detail, and shopping-category catalog listing in `tests/integration/ingredient.integration.test.ts` (append; do not parallel with US1 integration authors)

### Implementation for User Story 2

- [x] T019 [US2] Implement `listIngredients` (case-insensitive A–Z by `displayName`) and `getIngredient` on `src/services/ingredient-service.ts` scoped to household
- [x] T020 [US2] Implement `GET /ingredients`, `GET /ingredients/{ingredientId}`, and `GET /shopping-categories` in `src/api/routes/ingredients.ts` per `specs/004-ingredient/contracts/ingredients.openapi.yaml`
- [x] T021 [US2] Ensure list response includes `maxIngredients: 500` and `404` for missing ingredient ids in `src/api/routes/ingredients.ts`

**Checkpoint**: US1 + US2 — create, list A–Z, view, and shopping-category catalog work independently

---

## Phase 5: User Story 3 - Update or remove a catalog ingredient (Priority: P2)

**Goal**: Organizer can full-replace an ingredient (required `shoppingCategoryId` + `aliases` on PUT; `null` / `[]` clear; last-write-wins) or permanently delete after client confirmation; invalid replace leaves prior row unchanged.

**Independent Test**: PUT changes name/unit/category → reopen shows only new values; PUT with `shoppingCategoryId: null` clears category; PUT omitting `shoppingCategoryId` or `aliases` → `VALIDATION_ERROR` and prior unchanged; invalid PUT → prior unchanged; DELETE → absent from list; second DELETE → `404`.

### Tests for User Story 3

- [x] T022 [US3] Contract tests for `PUT /ingredients/{ingredientId}` (`ReplaceIngredientRequest`) and `DELETE /ingredients/{ingredientId}` in `tests/contract/ingredients.contract.test.ts` (append; do not parallel with US1/US2 contract authors)
- [x] T023 [US3] Integration tests for replace success, clear shopping category via `null`, clear aliases via `[]`, omit `shoppingCategoryId` or `aliases` → `VALIDATION_ERROR` (prior unchanged), invalid replace leaves prior unchanged, permanent delete, and delete-not-found in `tests/integration/ingredient.integration.test.ts` (append; do not parallel with US1/US2 integration authors)

### Implementation for User Story 3

- [x] T024 [US3] Implement `replaceIngredient` (full replace requiring `shoppingCategoryId` + `aliases`; `null` / `[]` clear; uniqueness excluding self; last successful write wins) and `deleteIngredient` (permanent) on `src/services/ingredient-service.ts`
- [x] T025 [US3] Implement `PUT /ingredients/{ingredientId}` (Zod `ReplaceIngredientRequest`) and `DELETE /ingredients/{ingredientId}` (`204` on success) in `src/api/routes/ingredients.ts`
- [x] T026 [US3] Confirm replace keeps Ingredient identity stable across display-name changes and leaves prior row unchanged on validation/label conflicts in `src/domain/ingredient.ts` / `src/services/ingredient-service.ts`

**Checkpoint**: US1–US3 — full catalog CRUD independently functional

---

## Phase 6: User Story 4 - Maintain aliases for matching (Priority: P3)

**Goal**: Organizer can save ordered aliases with blank-drop and case-insensitive first-seen collapse; reject alias = own display name and cross-ingredient label collisions without silent drops; preserve alias order after normalization (SC-006).

**Independent Test**: Save two distinct aliases → reopen shows both in order; duplicate/case-variant aliases collapse; alias matching own display name → `INGREDIENT_LABEL_CONFLICT` entire save rejected; alias matching another ingredient’s name/alias → rejected; rename+alias conflict on same save → rejected.

### Tests for User Story 4

- [x] T027 [P] [US4] Unit tests for alias collapse, own-name conflict, and rename+alias same-save conflict in `tests/unit/ingredient.test.ts` (append dedicated cases; coordinate if US1 unit author still active)
- [x] T028 [US4] Integration tests for alias order persistence (SC-006), cross-ingredient alias collision, and reject-without-silent-drop behavior in `tests/integration/ingredient.integration.test.ts` (append; do not parallel with earlier authors on that file)
- [x] T029 [US4] Integration test: two `IngredientService` instances (or constructor `householdId` overrides) prove ingredients created in household A never appear in list/get for household B (FR-014) in `tests/integration/ingredient.integration.test.ts` (append; do not parallel with earlier authors on that file)

### Implementation for User Story 4

- [x] T030 [US4] Harden create/replace alias paths in `src/domain/ingredient.ts` and `src/services/ingredient-service.ts` so own-name/alias and cross-ingredient conflicts always raise `INGREDIENT_LABEL_CONFLICT` with no silent alias drops
- [x] T031 [US4] Confirm recipe free-text ingredient lines remain untouched (no FK linking; do not import catalog Ingredient types into recipe normalize) in `src/domain/recipe.ts` / `src/api/routes/recipes.ts` — no recipe schema changes for this feature

**Checkpoint**: All four user stories independently functional; alias matching foundation locked; household isolation verified at service layer

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and operator readiness

- [x] T032 [P] Update root `README.md` with Ingredients feature pointer and link to `specs/004-ingredient/quickstart.md`; confirm agent plan pointer is `specs/004-ingredient/plan.md`
- [x] T033 Validate quickstart smoke flows (units, shopping categories, create, list A–Z, get, replace/clear category, unknown unit/category, label conflict, delete, restart persistence) per `specs/004-ingredient/quickstart.md`
- [x] T034 [P] Run full `npm test` and fix any regressions in ingredient, recipe, preference, or family-member suites
- [x] T035 Confirm out-of-scope boundaries: no recipe↔catalog linking, no dietary flags on ingredients, no pantry/grocery list generation in `src/api/routes/ingredients.ts` / `src/services/ingredient-service.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately (builds on `001`–`003`)
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; uses created ingredients from US1 for demos but is independently testable with seeded rows
- **User Story 3 (Phase 5)**: Depends on Foundational; needs existing ingredient rows (seed in tests)
- **User Story 4 (Phase 6)**: Depends on Foundational; hardens alias rules on create/replace and verifies FR-014 isolation via injectable `householdId`
- **Polish (Phase 7)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on US2–US4
- **User Story 2 (P2)**: After Foundational — independently testable with seeded ingredients
- **User Story 3 (P2)**: After Foundational — independently testable with seeded ingredients
- **User Story 4 (P3)**: After Foundational — independently testable via domain + create/replace assertions; practically follows US1 create path

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Domain/service before endpoints
- Story complete before moving to next priority (or parallelize if staffed)

### Parallel Opportunities

- T001–T002 setup can proceed together
- T003, T004, T005, T006 are [P] within Foundational (different files); T007 depends on T006; T008 depends on T003/T004/T005
- T009–T012 US1 tests can run in parallel (different files)
- T017/T018/T022/T023/T028/T029 append shared contract/integration files — **not** parallel with each other or with T011/T012 authors
- T027 may append `ingredient.test.ts` — coordinate with T009
- After Foundational, US1/US2/US3 can proceed in parallel if capacity allows (watch shared files: `ingredient-service.ts`, `ingredients.ts`, `app.ts`)

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Unit tests in tests/unit/ingredient.test.ts"
Task: "Unit tests in tests/unit/shopping-categories.test.ts"
Task: "Integration tests in tests/integration/ingredient.integration.test.ts"
Task: "Contract tests for POST /ingredients in tests/contract/ingredients.contract.test.ts"

# Then implement sequentially (shared service/route files):
Task: "IngredientService.createIngredient in src/services/ingredient-service.ts"
Task: "POST /ingredients in src/api/routes/ingredients.ts"
Task: "Mount routes in src/api/app.ts"
```

---

## Parallel Example: User Story 2

```bash
# After US1 contract/integration authors finish (shared files):
Task: "Contract tests for GET list/detail/shopping-categories (append)"
Task: "Integration tests for list A–Z / get / shopping-categories (append)"

# Implementation:
Task: "listIngredients + getIngredient in src/services/ingredient-service.ts"
Task: "GET endpoints in src/api/routes/ingredients.ts"
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

1. Setup + Foundational → schema, catalogs, normalize ready
2. US1 → create ingredients (MVP)
3. US2 → list A–Z / view + shopping-category catalog
4. US3 → replace (incl. clear category) + permanent delete
5. US4 → alias hardening + household isolation
6. Polish → quickstart + README + full test run

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2 (coordinate on `ingredients.ts` / `ingredient-service.ts`)
   - Developer C: User Story 3 (coordinate on same shared files)
   - Developer D: User Story 4 assertions after create/replace paths exist
3. Merge carefully around `src/api/routes/ingredients.ts`, `src/services/ingredient-service.ts`, and `src/api/app.ts`

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Do not implement recipe↔catalog linking, dietary flags on ingredients, pantry quantities, or grocery list generation
- Do not add p95/sub-200ms latency gates in this feature (plan stretch target only — SC-002 is a manual UX outcome, not a load harness)
- SC-002 and SC-004 are manual UX outcomes validated during T033 quickstart / organizer demos; do not add automated timing or findability harnesses
- Field limits → `INGREDIENT_LIMIT` (400); catalog at 500 → `INGREDIENT_CATALOG_FULL` (409); label conflicts → `INGREDIENT_LABEL_CONFLICT` (409)
- Units MUST reuse `src/domain/ingredient-units.ts` / existing `GET /ingredient-units`
- Recipe free-text ingredient lines MUST remain unchanged (FR-013 / T031)
- PUT requires `shoppingCategoryId` + `aliases`; `null` / `[]` clear; omit → `VALIDATION_ERROR`
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
