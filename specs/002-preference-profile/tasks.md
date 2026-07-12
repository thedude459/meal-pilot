# Tasks: Preference Profiles

**Input**: Design documents from `/specs/002-preference-profile/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — `plan.md` scopes Vitest unit/integration/contract suites for new preference rules

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm `001-family-member` foundation and reserve test layout for preference hardening

- [x] T001 Verify existing project layout (`src/domain/`, `src/services/`, `src/api/routes/`, `src/db/`) matches `specs/002-preference-profile/plan.md` and create `tests/{unit,integration,contract}/` if missing
- [x] T002 [P] Confirm npm scripts (`dev`, `db:migrate`, `test`) and Vitest config in `package.json` / `vitest.config.ts` support preference test suites

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain constants, errors, and normalization/validation helpers shared by all preference stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add `PREFERENCE_LIMIT` to `ErrorCode` and `preferenceLimitError` helper in `src/domain/errors.ts`
- [x] T004 [P] Add preference constants (`MAX_LABEL_LENGTH=40`, `MAX_LIKES=50`, `MAX_DISLIKES=50`) and export them from `src/domain/preference-profile.ts`
- [x] T005 Extend `src/domain/preference-profile.ts` with `normalizePreferenceInput` (trim blanks, collapse case-insensitive like/dislike duplicates preserving order, collapse duplicate restriction IDs preserving first-seen order) and `assertPreferenceLimits` (reject over-length labels / over-count lists atomically)
- [x] T006 Align consumer helpers in `src/domain/preference-profile.ts` so `effectiveLikes` applies dislike-wins only and does **not** filter likes against dietary restrictions; keep `effectiveDislikes` and `hardRestrictions` as stored-derived views without mutating stored lists
- [x] T007 Confirm dietary restriction catalog in `src/domain/dietary-restrictions.ts` still matches `specs/002-preference-profile/data-model.md` (no schema migration required unless drift found)

**Checkpoint**: Foundation ready — preference validation and effective helpers are available for story work

---

## Phase 3: User Story 1 - Edit a member's preference profile (Priority: P1) 🎯 MVP

**Goal**: Organizer can full-replace likes, dislikes, and catalog dietary restrictions with normalization, 40-char / 50+50 limits, restriction dedupe, unknown-restriction rejection, and last-write-wins semantics.

**Independent Test**: PUT preferences with like, dislike, and valid restriction → reopen shows normalized saved values; 41-char label or >50 likes → `PREFERENCE_LIMIT` and prior profile unchanged; unknown restriction → `UNKNOWN_RESTRICTION`.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T008 [P] [US1] Unit tests for normalize/limits/restriction-dedupe in `tests/unit/preference-profile.test.ts`
- [x] T009 [P] [US1] Integration tests for `replacePreferences` success, unknown restriction, and preference limit rejection (prior row unchanged) in `tests/integration/preference-profile.integration.test.ts`
- [x] T010 [P] [US1] Contract tests for `PUT /family-members/{memberId}/preferences` per `specs/002-preference-profile/contracts/preference-profiles.openapi.yaml` in `tests/contract/preference-profiles.contract.test.ts`

### Implementation for User Story 1

- [x] T011 [US1] Wire `replacePreferences` in `src/services/family-member-service.ts` to call normalize + limit asserts + catalog checks before atomic full replace (last successful write wins; no partial apply)
- [x] T012 [US1] Ensure Zod `ReplacePreferencesRequest` shape validation remains transport-only in `src/api/routes/family-members.ts` and maps `PREFERENCE_LIMIT` / `UNKNOWN_RESTRICTION` via existing error middleware in `src/api/app.ts`
- [x] T013 [US1] Confirm `PUT /family-members/{memberId}/preferences` returns normalized `PreferenceProfile` body on success in `src/api/routes/family-members.ts`

**Checkpoint**: US1 MVP — preference replace with limits and catalog validation works end-to-end

---

## Phase 4: User Story 2 - View preference profiles and the restriction catalog (Priority: P2)

**Goal**: Organizer can view a member's stored preferences and the predefined dietary restriction catalog with human-readable labels; empty profiles are valid.

**Independent Test**: GET preferences for a known member matches last save; GET catalog lists predefined id+label entries; empty member profile returns empty arrays.

### Tests for User Story 2

- [x] T014 [US2] Contract tests for `GET /dietary-restrictions` and `GET /family-members/{memberId}/preferences` in `tests/contract/preference-profiles.contract.test.ts` (append; do not parallel with US1 contract authors)
- [x] T015 [US2] Integration tests for get-stored-preferences (including empty profile) and catalog listing in `tests/integration/preference-profile.integration.test.ts` (append; do not parallel with US1 integration authors)

### Implementation for User Story 2

- [x] T016 [US2] Add `getPreferences(memberId)` (or equivalent) on `src/services/family-member-service.ts` returning stored likes/dislikes/dietaryRestrictionIds without mutation
- [x] T017 [US2] Implement `GET /family-members/{memberId}/preferences` in `src/api/routes/family-members.ts` per `specs/002-preference-profile/contracts/preference-profiles.openapi.yaml`
- [x] T018 [US2] After T017, verify `GET /dietary-restrictions` returns catalog id+label pairs from `src/domain/dietary-restrictions.ts` via `src/api/routes/family-members.ts` (adjust only if response shape drifts from contract)

**Checkpoint**: US1 + US2 — edit and view preferences/catalog work independently

---

## Phase 5: User Story 3 - Resolve preference conflicts for meal-planning consumers (Priority: P3)

**Goal**: Expose effective preferences for consumers: dislike-wins likes, unchanged hard restrictions, order-stable stored lists; no like↔restriction stripping inside PreferenceProfile.

**Independent Test**: Profile with overlapping like/dislike → effective likes exclude overlap; hardRestrictions match stored IDs; GET effective does not drop likes solely because restrictions are present; two members remain isolated.

### Tests for User Story 3

- [x] T019 [P] [US3] Unit tests for `effectiveLikes` / `effectiveDislikes` / `hardRestrictions` (dislike-wins; no restriction filtering of likes; order stability) in `tests/unit/preference-profile-effective.test.ts`
- [x] T020 [US3] Contract + integration coverage for `GET /family-members/{memberId}/preferences/effective` and cross-member isolation in `tests/contract/preference-profiles.contract.test.ts` and `tests/integration/preference-profile.integration.test.ts` (append; do not parallel with US1/US2 authors on those files)

### Implementation for User Story 3

- [x] T021 [US3] Add `getEffectivePreferences(memberId)` in `src/services/family-member-service.ts` composing domain helpers without mutating stored JSON columns
- [x] T022 [US3] Implement `GET /family-members/{memberId}/preferences/effective` in `src/api/routes/family-members.ts` returning `effectiveLikes`, `effectiveDislikes`, `hardRestrictions`
- [x] T023 [US3] Confirm replace path preserves relative order after normalization for likes, dislikes, and restriction IDs in `src/domain/preference-profile.ts` / `src/services/family-member-service.ts` (regression for SC-007)

**Checkpoint**: All three user stories independently functional via API

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and operator readiness

- [x] T024 [P] Update root `README.md` with Preference Profiles pointers to `specs/002-preference-profile/quickstart.md`
- [x] T025 Validate quickstart smoke flows (catalog, replace, get stored, get effective, limit rejection, unknown restriction, restart persistence) per `specs/002-preference-profile/quickstart.md`
- [x] T026 [P] Run full `npm test` and fix any regressions in preference or family-member suites
- [x] T027 Confirm PreferenceProfile lifecycle remains owned by FamilyMember: member create yields empty profile; member delete makes `GET .../preferences` return 404; no standalone profile create/delete routes exist (`src/services/family-member-service.ts`, `src/api/routes/family-members.ts`) — covers FR-015/FR-016

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately (builds on `001-family-member`)
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; uses saved profiles from US1 for demos but is independently testable with seeded members
- **User Story 3 (Phase 5)**: Depends on Foundational; uses stored profiles from US1 for demos but effective helpers are independently unit-testable
- **Polish (Phase 6)**: Depends on desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational — no dependency on US2/US3
- **User Story 2 (P2)**: After Foundational — independently testable with empty or seeded profiles
- **User Story 3 (P3)**: After Foundational — independently testable via domain helpers + effective GET

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Domain/service before endpoints
- Story complete before moving to next priority (or parallelize if staffed)

### Parallel Opportunities

- T001–T002 setup can proceed together once layout check starts
- T003 and T004 are [P] within Foundational (different concerns/files)
- T008–T010 US1 tests can run in parallel (different files)
- T019 US3 unit tests can run in parallel with other work (dedicated
  `preference-profile-effective.test.ts`)
- T014/T015/T020 append shared contract/integration files — **not** parallel with
  each other or with T009/T010 authors
- T018 runs after T017 (same `family-members.ts` route file)
- After Foundational, US1/US2/US3 implementation can proceed in parallel if
  capacity allows (watch shared files: `family-member-service.ts`,
  `family-members.ts`)

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Unit tests for normalize/limits in tests/unit/preference-profile.test.ts"
Task: "Integration tests for replacePreferences in tests/integration/preference-profile.integration.test.ts"
Task: "Contract tests for PUT preferences in tests/contract/preference-profiles.contract.test.ts"

# Then implement service + route wiring sequentially (shared files):
Task: "Wire replacePreferences in src/services/family-member-service.ts"
Task: "Map PREFERENCE_LIMIT in src/api/routes/family-members.ts / src/api/app.ts"
```

---

## Parallel Example: User Story 2

```bash
# Launch US2 tests after US1 contract/integration authors finish (shared files):
Task: "Contract tests for GET preferences + catalog (append)"
Task: "Integration tests for get-stored-preferences + catalog (append)"

# Implementation:
Task: "getPreferences in src/services/family-member-service.ts"
Task: "GET /family-members/{memberId}/preferences in src/api/routes/family-members.ts"
Task: "Verify GET /dietary-restrictions catalog shape"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Preference replace + limits independently
5. Demo via PUT/GET member preferences if ready

### Incremental Delivery

1. Setup + Foundational → helpers and errors ready
2. US1 → replace with validation (MVP)
3. US2 → explicit GET preferences + catalog verification
4. US3 → effective preferences for consumers
5. Polish → quickstart + README + full test run

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2 (coordinate on shared route file)
   - Developer C: User Story 3 (coordinate on shared route/service files)
3. Merge carefully around `src/api/routes/family-members.ts` and `src/services/family-member-service.ts`

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- PreferenceProfile lifecycle (create/delete with member) remains owned by `001-family-member`
- Do not reintroduce like↔restriction stripping in domain helpers
- Do not add p95/sub-200ms latency gates in this feature (plan stretch target only)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
