# Implementation Plan: Family Member Profiles

**Branch**: `001-family-member` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-family-member/spec.md`

## Summary

Deliver the household roster foundation: create, view, rename, and permanently
remove FamilyMembers (max 12), each with exactly one PreferenceProfile. Profiles
store free-text likes/dislikes and predefined dietary restrictions (hard
exclusions for later meal planning). Domain logic lives in Speckit-aligned
services; persistence is local SQLite for a single household. A thin HTTP API
exposes organizer operations for UI and contract tests.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Hono (HTTP API), Zod (validation), Drizzle ORM +
better-sqlite3 (persistence), Vitest (tests)

**Storage**: SQLite (single-file, single-household local-first)

**Testing**: Vitest available for unit/integration/contract tests. Automated test
authoring is deferred for this feature (not requested in spec); structure under
`tests/` is reserved for a follow-up. Quickstart smoke (T027) is the acceptance
verification path for v1.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); API consumed by
a future organizer UI

**Project Type**: Single-project modular domain service + HTTP API

**Performance Goals**: Organizer can add a member in under 1 minute (SC-001).
Sub-200ms roster/profile ops for a 12-member household is a stretch target
deferred beyond this feature’s tasks (no load harness in scope).

**Constraints**: Deterministic non-AI paths; max 12 members; case-insensitive
unique display names; dietary restrictions from predefined catalog only; permanent
delete (no restore); no business logic outside Speckit-defined domain modules

**Scale/Scope**: 1 household, ≤12 FamilyMembers, preference lists typically tens
of labels per member; meal planning / grocery / pantry out of scope for this
feature

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: PASS — PreferenceProfile captures likes,
  dislikes, and hard dietary exclusions; conflict rules (dislike > like for
  effective likes; hard restrictions exposed for meal-matching consumers —
  see `002-preference-profile`) encoded in domain model for consumers.
- **Balanced Weekly Planning**: N/A — out of scope for this feature.
- **Automatic Grocery Generation**: N/A — out of scope for this feature.
- **Pantry-Aware Inventory**: N/A — out of scope for this feature.
- **Hybrid Recipe Sourcing**: N/A — out of scope for this feature.
- **Speckit-Driven Modularity**: PASS — FamilyMember and PreferenceProfile are
  Speckit domain entities; FamilyMemberService (roster + profile CRUD) owns all
  business rules; HTTP layer is transport only.
- **Extensibility**: PASS — module declares purpose (household roster +
  preferences) and dependency (none yet); exposes read models for future
  `GenerateWeeklyMeals` without breaking contracts.

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/001-family-member/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── family-members.openapi.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── family-member.ts          # FamilyMember entity + validation
│   ├── preference-profile.ts     # PreferenceProfile + conflict helpers
│   ├── dietary-restrictions.ts   # Predefined restriction catalog
│   └── errors.ts                 # Shared domain/API error codes
├── services/
│   └── family-member-service.ts  # Roster + profile use cases
├── db/
│   ├── schema.ts                 # Drizzle SQLite schema
│   ├── client.ts                 # DB connection
│   └── migrations/               # SQL migrations
├── api/
│   ├── app.ts                    # Hono app
│   └── routes/
│       └── family-members.ts     # HTTP routes (transport only)
└── index.ts                      # Process entry

tests/
├── contract/
│   └── family-members.contract.test.ts
├── integration/
│   └── family-member-service.integration.test.ts
└── unit/
    ├── family-member.test.ts
    ├── preference-profile.test.ts
    └── dietary-restrictions.test.ts
```

**Structure Decision**: Single project (domain + services + SQLite + Hono API).
No separate frontend in this feature; contracts define the organizer-facing API
for a future UI.

## Complexity Tracking

> No constitution violations requiring justification.
