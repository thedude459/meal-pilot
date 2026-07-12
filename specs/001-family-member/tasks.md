# Tasks: Family Member Profiles

**Input**: Design documents from `/specs/001-family-member/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not included — feature specification did not explicitly request TDD/test tasks

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create source directories `src/domain/`, `src/services/`, `src/db/migrations/`, `src/api/routes/` and `tests/{unit,integration,contract}/` per `specs/001-family-member/plan.md`
- [x] T002 Initialize Node.js 22 TypeScript project with `package.json`, `tsconfig.json`, and dependencies (hono, zod, drizzle-orm, better-sqlite3, drizzle-kit, vitest, typescript) at repository root
- [x] T003 [P] Add npm scripts (`dev`, `build`, `db:migrate`, `test`) in `package.json` and Vitest config in `vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Define Drizzle SQLite schema for Household, FamilyMember, and PreferenceProfile in `src/db/schema.ts`
- [x] T005 [P] Implement SQLite client and data directory bootstrap in `src/db/client.ts`
- [x] T006 Create initial SQL migration for household/member/profile tables and uniqueness constraints in `src/db/migrations/`
- [x] T007 [P] Implement predefined dietary restriction catalog in `src/domain/dietary-restrictions.ts`
- [x] T008 [P] Implement FamilyMember domain types and display-name validation helpers in `src/domain/family-member.ts`
- [x] T009 [P] Implement PreferenceProfile domain types and consumer conflict helpers in `src/domain/preference-profile.ts`
- [x] T010 Implement shared domain/API error codes (`VALIDATION_ERROR`, `DUPLICATE_NAME`, `MEMBER_LIMIT`, `UNKNOWN_RESTRICTION`, `NOT_FOUND`) in `src/domain/errors.ts`
- [x] T011 Create Hono app shell with JSON error mapping in `src/api/app.ts` and process entry in `src/index.ts`
- [x] T012 Seed singleton Household on startup via migration or bootstrap in `src/db/client.ts`

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Add a family member (Priority: P1) 🎯 MVP

**Goal**: Organizer can add FamilyMembers (with auto-created empty PreferenceProfile) and see them on the household roster, with empty-name, duplicate-name, and 12-member-cap enforcement.

**Independent Test**: POST a member with display name → appears in GET roster with empty preferences; reject empty name, duplicate name, and 13th member.

### Implementation for User Story 1

- [x] T013 [US1] Implement `createFamilyMember` and `listFamilyMembers` in `src/services/family-member-service.ts` (auto-create empty PreferenceProfile; enforce unique `displayNameKey` and max 12)
- [x] T014 [US1] Add Zod request schemas for create member in `src/api/routes/family-members.ts`
- [x] T015 [US1] Implement `POST /family-members` and `GET /family-members` in `src/api/routes/family-members.ts` and mount routes in `src/api/app.ts`
- [x] T016 [P] [US1] Implement `GET /dietary-restrictions` catalog endpoint in `src/api/routes/family-members.ts` (or `src/api/routes/dietary-restrictions.ts`) per `specs/001-family-member/contracts/family-members.openapi.yaml`
- [x] T017 [US1] Wire service create/list to Drizzle repositories/queries in `src/services/family-member-service.ts` against `src/db/schema.ts`

**Checkpoint**: US1 MVP — add and list members works end-to-end

---

## Phase 4: User Story 2 - Capture preferences, dislikes, and dietary restrictions (Priority: P2)

**Goal**: Organizer can save free-text likes/dislikes and predefined dietary restrictions on a member's PreferenceProfile; unknown restriction IDs rejected.

**Independent Test**: PUT preferences with like, dislike, and valid restriction → GET member shows exact values; unknown restriction ID returns `UNKNOWN_RESTRICTION`.

### Implementation for User Story 2

- [x] T018 [US2] Implement `getFamilyMember` and `replacePreferences` in `src/services/family-member-service.ts` (validate restriction IDs against `src/domain/dietary-restrictions.ts`; isolate profiles per member)
- [x] T019 [US2] Add Zod schema for `ReplacePreferencesRequest` in `src/api/routes/family-members.ts`
- [x] T020 [US2] Implement `GET /family-members/{memberId}` and `PUT /family-members/{memberId}/preferences` in `src/api/routes/family-members.ts`
- [x] T021 [US2] Ensure preference conflict helpers in `src/domain/preference-profile.ts` expose effective likes/dislikes/hardRestrictions for future meal-planning consumers without mutating stored lists

**Checkpoint**: US1 + US2 — roster create/list and preference editing work independently

---

## Phase 5: User Story 3 - Maintain the household roster (Priority: P3)

**Goal**: Organizer can rename members and permanently delete a member (cascading PreferenceProfile) with no restore.

**Independent Test**: PATCH rename updates roster; DELETE returns 204 and subsequent GET is 404; deleted preferences are gone.

### Implementation for User Story 3

- [x] T022 [US3] Implement `updateFamilyMember` (rename with uniqueness checks) in `src/services/family-member-service.ts`
- [x] T023 [US3] Implement `deleteFamilyMember` permanent cascade delete in `src/services/family-member-service.ts` (immediate delete; no server-side confirm or restore)
- [x] T024 [US3] Implement `PATCH /family-members/{memberId}` and `DELETE /family-members/{memberId}` in `src/api/routes/family-members.ts`
- [x] T025 [US3] Confirm OpenAPI error mappings for rename conflicts and not-found delete in `src/api/app.ts` / `src/api/routes/family-members.ts`

**Checkpoint**: All three user stories independently functional via API

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and operator readiness

- [x] T026 [P] Add root `README.md` with setup pointers to `specs/001-family-member/quickstart.md`
- [x] T027 Validate quickstart smoke flows (create, list, preferences, rename, delete, restart persistence) against running server per `specs/001-family-member/quickstart.md`
- [x] T028 [P] Add `.gitignore` entries for `node_modules/`, `dist/`, and `data/*.sqlite`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; practically builds on US1 create/list for manual demos but is independently testable with seeded members
- **User Story 3 (Phase 5)**: Depends on Foundational; rename/delete independently testable once members exist
- **Polish (Phase 6)**: Depends on desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependency on US2/US3
- **US2 (P2)**: Can start after Foundational — needs member identity; may use US1 create or direct DB seed
- **US3 (P3)**: Can start after Foundational — may use US1 create or direct DB seed

### Within Each User Story

- Domain/service before HTTP routes
- Validation schemas before route handlers
- Persist via service layer only (no business rules in routes)

### Parallel Opportunities

- Phase 1: T003 parallel with finishing T002 after package init
- Phase 2: T005, T007, T008, T009 parallel after T004 schema exists (T007–T009 also parallel with each other)
- Phase 3: T016 catalog endpoint parallel with T014–T015 once service create/list shape is known
- Phase 6: T026 and T028 parallel

---

## Parallel Example: User Story 1

```bash
# After T013 service create/list exists:
Task: "Add Zod request schemas for create member in src/api/routes/family-members.ts"
Task: "Implement GET /dietary-restrictions catalog endpoint"
```

---

## Parallel Example: Foundational

```bash
# After schema (T004):
Task: "Implement dietary restriction catalog in src/domain/dietary-restrictions.ts"
Task: "Implement FamilyMember domain helpers in src/domain/family-member.ts"
Task: "Implement PreferenceProfile helpers in src/domain/preference-profile.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Create + list members via curl; reject empty/duplicate/13th
5. Demo MVP roster

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → MVP roster
3. US2 → preference capture
4. US3 → rename + permanent delete
5. Polish → README + quickstart validation

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. After Foundational:
   - Developer A: US1 API create/list
   - Developer B: US2 preferences (with seeded members)
   - Developer C: US3 rename/delete (with seeded members)
3. Integrate on shared `family-member-service.ts` carefully (coordinate service methods)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete sibling work
- [USn] maps task to user story for traceability
- Keep business rules in `src/domain/` and `src/services/family-member-service.ts` only
- Contract file: `specs/001-family-member/contracts/family-members.openapi.yaml`
- Suggested next command: `/speckit-implement`
