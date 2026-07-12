# Implementation Plan: Preference Profiles

**Branch**: `002-preference-profile` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-preference-profile/spec.md`

## Summary

Harden PreferenceProfile as a first-class Speckit module on top of the existing
Family Member Profiles foundation. Organizers view and fully replace per-member
likes, dislikes, and catalog dietary restrictions with explicit validation
(40-char labels, 50/50 caps, restriction dedupe, order preservation). Domain
helpers expose effective likes (dislike-wins only), dislikes, and hard
restrictions for meal-planning consumers without rewriting stored lists or
resolving like↔restriction pairs. Like↔restriction precedence stays at
meal-matching time. Persistence and HTTP remain the existing SQLite + Hono stack;
this feature extends domain rules, service validation, and preference-focused
contracts—not roster create/rename/delete.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Hono (HTTP API), Zod (validation), Drizzle ORM +
better-sqlite3 (persistence), Vitest (tests)

**Storage**: SQLite (existing `preference_profiles` table; no schema change
expected unless JSON column validation stays application-side)

**Testing**: Vitest for unit (normalization, limits, effective helpers),
integration (replace + isolation), and contract (preference OpenAPI). Automated
suites under `tests/` are in scope for this feature’s new rules; quickstart
smoke remains the manual acceptance path.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); API consumed by
a future organizer UI and later meal-planning modules

**Project Type**: Single-project modular domain service + HTTP API

**Performance Goals**: Organizer preference edit completable in under 2 minutes
(SC-002). Sub-200ms preference read/replace for ≤12 members is a stretch target;
explicitly out of task scope for `002` — no load harness or latency assertion in
`tasks.md`. Quickstart smoke remains the manual acceptance path alongside Vitest.

**Constraints**: Deterministic non-AI paths; hybrid capture (free-text likes/
dislikes + catalog restrictions); label ≤40 chars; ≤50 likes and ≤50 dislikes
after normalization; last-write-wins full replace; no business logic outside
Speckit domain modules; PreferenceProfile lifecycle owned by FamilyMember

**Scale/Scope**: 1 household, ≤12 members, ≤50 likes + ≤50 dislikes + catalog
restrictions per profile; meal planning / grocery / pantry out of delivery scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: PASS — PreferenceProfile stores likes,
  dislikes, and hard dietary exclusions; dislike-wins for effective likes;
  hard restrictions exposed for consumers; like↔restriction precedence deferred
  to meal matching per clarification (still honors restrictions at plan time).
- **Balanced Weekly Planning**: N/A — out of scope for this feature.
- **Automatic Grocery Generation**: N/A — out of scope for this feature.
- **Pantry-Aware Inventory**: N/A — out of scope for this feature.
- **Hybrid Recipe Sourcing**: N/A — out of scope for this feature (consumers
  of hardRestrictions will validate AI recipes later).
- **Speckit-Driven Modularity**: PASS — PreferenceProfile is a Speckit domain
  entity with dedicated helpers/service rules; HTTP remains transport-only;
  depends on FamilyMember from `001-family-member`.
- **Extensibility**: PASS — module declares purpose (preference capture +
  consumer effective views) and dependency (FamilyMember roster); additive
  catalog IDs and future meal matchers can consume without breaking contracts.

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/002-preference-profile/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── preference-profiles.openapi.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── preference-profile.ts     # Normalize, limits, effective* helpers
│   ├── dietary-restrictions.ts   # Predefined catalog (reuse)
│   ├── family-member.ts          # Owned by 001; dependency only
│   └── errors.ts                 # Add preference limit error codes as needed
├── services/
│   └── family-member-service.ts  # replacePreferences + get profile; extend
│       # OR preference-profile-service.ts if extracted for modularity
├── db/
│   ├── schema.ts                 # Existing preference_profiles (reuse)
│   ├── client.ts
│   └── migrations/
├── api/
│   ├── app.ts
│   └── routes/
│       └── family-members.ts     # Preference routes + catalog (extend)
└── index.ts

tests/
├── contract/
│   └── preference-profiles.contract.test.ts
├── integration/
│   └── preference-profile.integration.test.ts
└── unit/
    ├── preference-profile.test.ts
    └── preference-profile-effective.test.ts
```

**Structure Decision**: Continue the single-project layout from
`001-family-member`. Prefer extending `preference-profile` domain helpers and
`FamilyMemberService.replacePreferences` / read paths over a parallel stack.
Extract a thin `PreferenceProfileService` only if tasks show roster coupling
blocking clarity—default is extend-in-place.

## Complexity Tracking

> No constitution violations requiring justification.
