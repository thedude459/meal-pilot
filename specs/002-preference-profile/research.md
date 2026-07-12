# Research: Preference Profiles

**Feature**: `002-preference-profile` | **Date**: 2026-07-12

## 1. Relationship to Family Member Profiles

**Decision**: Treat `001-family-member` as a hard dependency; extend existing
SQLite schema, Hono routes, and `FamilyMemberService` preference methods rather
than introducing a separate persistence stack.

**Rationale**: Spec assumes auto-created empty profiles and cascade delete on
member remove. Duplicating storage would break 1:1 integrity and Speckit
modularity.

**Alternatives considered**:
- Standalone PreferenceProfile microservice — unjustified for single-household
  local v1.
- Rewrite roster+preferences as one feature — rejected; Speckit entity
  boundaries keep PreferenceProfile evolvable.

## 2. Like↔restriction precedence

**Decision**: PreferenceProfile does not detect or strip likes against dietary
restrictions. `effectiveLikes` applies dislike-wins only. `hardRestrictions`
returns stored catalog IDs unchanged. Meal-planning consumers must exclude
restricted meals at match time even if a like would favor them.

**Rationale**: Clarification (session 2026-07-12): deferred to meal matching.
Avoids inventing a food ontology in this module and matches constitution intent
without silent mutation of organizer-entered likes.

**Alternatives considered**:
- Exact label match against restriction id/label — brittle and incomplete.
- Semantic tag ontology per restriction — deferred to future recipe/planning
  features.
- Auto-strip conflicting likes on save — mutates user intent; rejected.

**Note**: Supersedes `001-family-member` research item that suggested helpers
apply “restriction-over-like” inside PreferenceProfile. Stored lists and
effective likes no longer implement that pairing here.

## 3. Label limits and validation placement

**Decision**: Enforce max 40 characters per like/dislike (after trim) and max 50
likes / 50 dislikes after blank removal and case-insensitive duplicate collapse.
Reject the entire replace (atomic) with a clear domain error; do not partially
apply.

**Rationale**: Clarification requires testable caps; domain-layer enforcement
keeps HTTP Zod as shape-only and preserves Speckit business-rule ownership.

**Alternatives considered**:
- Soft limits / truncate — silently changes user input; rejected.
- API-only Zod maxLength — duplicates/rules can drift from domain consumers.
- Unlimited labels — rejected by clarification.

## 4. Order preservation and restriction dedupe

**Decision**: Keep relative order after normalization for likes, dislikes, and
dietary restriction IDs. Collapse duplicate labels (case-insensitive) and
duplicate restriction IDs to first-seen entries. Order is display/stability
only—not preference strength.

**Rationale**: Clarifications require preserve-order and restriction collapse.
Existing `collapseLabels` already preserves first-seen order; extend a
`collapseRestrictionIds` (or equivalent) with the same first-seen semantics.
`Set` insertion order is acceptable if fed a pre-ordered unique list.

**Alternatives considered**:
- Alphabetical sort on save — rejected (clarification).
- Reject duplicate restriction IDs — worse UX for double-taps; rejected.
- Store duplicates — shifts burden to every consumer; rejected.

## 5. Concurrent saves

**Decision**: Last successful full replace wins; no ETag/version check and no
field-level merge in v1.

**Rationale**: Clarification; single household organizer; matches PUT replace
semantics already in the API.

**Alternatives considered**:
- Optimistic concurrency — unnecessary complexity for v1.
- Merge unions — can resurrect deleted labels unintentionally.

## 6. Consumer effective preference surface

**Decision**: Pure domain helpers remain the primary consumer contract:
`effectiveLikes`, `effectiveDislikes`, `hardRestrictions`. Optionally expose
`GET /family-members/{id}/preferences/effective` for contract tests and future
UI debugging; stored profile remains on member detail and/or
`GET .../preferences`.

**Rationale**: FR-014 requires exposing effective preferences without mutating
storage. Domain helpers are sufficient for in-process meal planners; an HTTP
effective view aids verification without embedding planning logic.

**Alternatives considered**:
- Domain-only (no HTTP effective) — acceptable; HTTP effective preferred for
  quickstart/contract clarity.
- Compute effective at save and persist — duplicates source of truth; rejected.

## 7. Error codes

**Decision**: Reuse `UNKNOWN_RESTRICTION`, `VALIDATION_ERROR`, `NOT_FOUND`. Add
`PREFERENCE_LIMIT` (or map over-limit to `VALIDATION_ERROR` with explicit
message) for label length and count violations. Prefer a distinct
`PREFERENCE_LIMIT` code for SC-003 clarity in contract tests.

**Rationale**: Organizers and tests need to distinguish catalog failures from
size/count failures.

**Alternatives considered**:
- Single `VALIDATION_ERROR` for all — simpler but weaker test targeting.

## 8. Testing strategy

**Decision**: Vitest unit tests for normalize/limits/effective helpers;
integration tests for replace isolation and persistence; contract tests against
`contracts/preference-profiles.openapi.yaml`.

**Rationale**: New rules (limits, order, restriction dedupe, effective semantics)
are high-regression risk relative to 001 smoke-only preference coverage.

**Alternatives considered**:
- Quickstart-only verification — insufficient for FR-010/FR-009/FR-014.
