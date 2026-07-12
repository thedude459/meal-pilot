# Research: Family Member Profiles

**Feature**: `001-family-member` | **Date**: 2026-07-12

## 1. Language & runtime

**Decision**: TypeScript 5.x on Node.js 22 LTS

**Rationale**: Strong typing for domain entities and Zod-validated boundaries;
excellent test tooling; natural fit for OpenAPI-driven contract tests; widely
supported for local Node services.

**Alternatives considered**:
- Python 3.12 + FastAPI — strong for APIs, but TS preferred for end-to-end typed
  contracts shared with a future web UI.
- Swift/Kotlin mobile-first — premature; organizer UI stack not chosen yet.

## 2. Persistence

**Decision**: SQLite via Drizzle ORM + better-sqlite3 (single local file)

**Rationale**: Spec assumes one household, ≤12 members, local persistence across
sessions. SQLite is zero-ops, deterministic, and sufficient; Drizzle keeps schema
close to the TypeScript domain model.

**Alternatives considered**:
- JSON file store — simpler but weaker for uniqueness constraints and migrations.
- PostgreSQL — overkill for single-household local-first v1.
- In-memory only — fails FR-004 (survive restarts).

## 3. HTTP framework

**Decision**: Hono

**Rationale**: Lightweight, TypeScript-first, easy to mount OpenAPI-aligned
routes; keeps HTTP as a thin transport over FamilyMemberService.

**Alternatives considered**:
- Express — mature but heavier and less typed by default.
- Fastify — solid; Hono chosen for smaller surface area for this domain slice.
- Domain-only library with no HTTP — harder to run contract/quickstart demos.

## 4. Validation

**Decision**: Zod schemas at API boundary; domain invariants in
FamilyMemberService / entity modules

**Rationale**: Separates transport validation from Speckit business rules
(uniqueness, 12-member cap, restriction catalog, permanent delete).

**Alternatives considered**:
- Manual checks only — error-prone for OpenAPI parity.
- Validate only in ORM — leaks business rules into persistence.

## 5. Dietary restriction catalog

**Decision**: Versioned in-code catalog (seeded into DB or imported as constants)
with stable string IDs; initial set covers common household needs

**Initial catalog IDs**:
`vegetarian`, `vegan`, `gluten_free`, `dairy_free`, `nut_free`,
`shellfish_free`, `egg_free`, `soy_free`, `halal`, `kosher`, `low_sodium`,
`pescatarian`

**Rationale**: Clarification requires a predefined list; in-code catalog keeps
v1 deterministic and reviewable. Expanding the list is a Speckit-compatible
extension (additive IDs).

**Alternatives considered**:
- Fully configurable user-defined restrictions — rejected by clarification
  (hybrid model: restrictions controlled).
- External nutrition API — out of scope; adds non-determinism/network dependency.

## 6. Preference conflict resolution helpers

**Decision**: Pure functions on PreferenceProfile for planning consumers:
`effectiveLikes`, `effectiveDislikes`, `hardRestrictions` — apply
dislike-over-like only (case-insensitive label compare). Do **not** resolve
like↔restriction pairs inside PreferenceProfile; meal-planning consumers apply
hard exclusions at meal-matching time.

**Rationale**: Encodes shared preference read rules once for future
`GenerateWeeklyMeals` without embedding planning or food-ontology logic here.

**Superseded by**: `specs/002-preference-profile/research.md` §2 (2026-07-12
clarification) — authoritative for like↔restriction precedence.

**Alternatives considered**:
- Restriction-over-like inside PreferenceProfile helpers — superseded; incomplete
  without a food ontology and mutates consumer interpretation prematurely.
- Auto-strip conflicting likes on save — would mutate user intent silently;
  prefer keep stored lists as entered and resolve at read/consume time.

## 7. Identity & delete semantics

**Decision**: UUID primary keys for FamilyMember; display name unique per
household (case-insensitive normalized key); PreferenceProfile 1:1 cascade
permanent delete

**Rationale**: Names can change (FR-006); stable IDs support future plan history
references without rewrite. Permanent delete matches clarification.

**Alternatives considered**:
- Name as primary key — breaks renames and historical references.
- Soft delete — out of scope per clarification.

## 8. Testing strategy

**Decision**: Vitest with three layers — unit (domain/conflict rules),
integration (service + SQLite), contract (HTTP vs OpenAPI)

**Rationale**: Matches Speckit modularity and checklist readiness; contract tests
lock organizer API for future UI.

**Alternatives considered**:
- Unit-only — insufficient for persistence and HTTP guarantees.
- E2E browser tests — no UI in this feature.
