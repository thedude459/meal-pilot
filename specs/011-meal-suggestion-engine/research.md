# Research: Meal Suggestion Engine

**Feature**: `011-meal-suggestion-engine` | **Date**: 2026-07-12

## 1. Relationship to GenerateWeeklyMeals (008)

**Decision**: Lock MealSuggestionEngine behavior to the existing `008` library-
only rules. This feature is the dedicated Speckit **service** contract and
bounded ownership layer; `008` remains the **workflow** that exposes generate
modes and WeeklyPlan persistence to organizers.

**Rationale**: Clarification Option A. Constitution requires services as Speckit
specs; duplicating or diverging ranking rules would create competing planners.

**Alternatives considered**:
- Allow ranking refinements in `011` — rejected by clarification.
- Full engine re-implementation — rejected by clarification Option B on
  delivery (bounded ownership, not rewrite).

## 2. Exposure surface

**Decision**: Internal service only. No new `POST /suggest` (or similar)
endpoint. Organizers continue to use:
- `POST /weekly-plans/generate` (`008`)
- `PUT /weekly-plans/{id}/slots/{day}/status` with `rejected` → alternative
  (`007`/`008`)

**Rationale**: Clarification Option A on exposure. Avoids a second planning
entry point and keeps WeeklyPlan as the only durable suggestion store.

**Alternatives considered**:
- Standalone suggest-candidates API — rejected by clarification.
- Both workflow + standalone — rejected by clarification.

## 3. Delivery shape (bounded ownership)

**Decision**:
- Own `src/domain/meal-suggestion.ts` (pure match/filter/rank/assign/
  alternative) and `src/services/meal-suggestion-service.ts` (load context,
  orchestrate, persist via WeeklyPlanService).
- Align module docs/exports to this feature’s service contract.
- Add/extend dedicated unit, integration, and contract tests under `011`
  attribution.
- Do **not** intentionally change scores, filters, rotation window, or soft-
  relax semantics.
- Do **not** reimplement from scratch.

**Rationale**: Clarification Option B. Satisfies Speckit modularity without
behavior drift vs shipping `008` engine.

**Alternatives considered**:
- Docs/verification only — rejected by clarification.
- Full rewrite behind same contract — rejected by clarification.

## 4. Locked ranking and filter rules (from 008 research)

**Decision**: Preserve exact `008` semantics:

| Layer | Rule |
|-------|------|
| Dietary hard filter | Recipe safe iff every household hard restriction ID ∈ `dietaryAttributeIds` |
| Dislike hard filter | Case-insensitive exact equality, token, or contiguous multi-word phrase against title + ingredient names |
| Likes | Soft: +2 per matching like (same matcher) |
| Pantry | Soft: +1 × (matched pantry names / ingredient count); never hard-block |
| Timing | Soft: `+ max(0, 120 - (prep+cook)) / 120` when timing present |
| Cuisine | Soft: +0.5 if first cuisine tag not yet used this week |
| Rotation | −5 if recipe in current week or prior 2 weeks (`[weekStart-14d, weekStart)`); soft-relax by dropping rotation exclusions only |
| Tie-break | Higher score, then `recipeId` ascending |
| Zero members | `GENERATION_NO_PREFERENCES`; empty profile on existing member is evaluable |

**Rationale**: Spec FR-016 + clarification lock; prevents silent drift.

**Alternatives considered**:
- Re-tune weights in `011` — rejected (intentional behavior change).
- Soft-relax cuisine/timing as exclusions — rejected; only rotation is an
  exclusion layer that soft-relaxes (`008`).

## 5. Contracts strategy (no new HTTP)

**Decision**: Publish an internal **service contract** YAML describing engine
operations, inputs, outputs, and error/reason codes. HTTP OpenAPI for generate/
reject remains authoritative under `specs/008-generate-weekly-meals/contracts/`.
Contract tests assert the TypeScript facade matches the service contract
(operation names, reason enums, zero-members error)—not a new route table.

**Rationale**: Spec forbids new organizer-facing suggest surface; still need a
reviewable interface for Speckit Phase 1 contracts.

**Alternatives considered**:
- Duplicate generate OpenAPI under `011` — confusing dual HTTP ownership;
  rejected.
- Skip contracts entirely — weaker modularity evidence; rejected.

## 6. Persistence boundary

**Decision**: Engine domain stays pure (no DB). Service facade loads snapshots
and writes slots only through WeeklyPlanService primitives already used by
`008`. No new tables or generation-run history.

**Rationale**: Matches `008` research; FR-012 forbids owning WeeklyPlan
persistence rules as a separate model.

**Alternatives considered**:
- Engine writes SQL directly — breaks modularity with WeeklyPlan service;
  rejected.
- Suggestion-result persistence table — out of scope; rejected.

## 7. Testing strategy

**Decision**:
- Unit: extend/own `tests/unit/meal-suggestion.test.ts` for locked scores,
  filters, soft-relax, alternatives, determinism.
- Integration: `meal-suggestion-engine.integration.test.ts` exercises generate
  + reject→alternative consumers and household isolation, asserting engine-
  owned outcomes without new routes.
- Contract: `meal-suggestion-engine.contract.test.ts` validates service
  contract enums/operations against exported domain constants and error codes.
- Golden behavior: where practical, assert parity with known `008` fixtures
  (same inputs → same ordered picks).

**Rationale**: SC-008 requires dedicated tests attributable to this feature;
Vitest layout matches `001`–`010`.

**Alternatives considered**:
- Rely solely on existing `008` integration tests — insufficient ownership
  attribution; rejected.
- Snapshot entire HTTP OpenAPI under `011` — wrong ownership; rejected.

## 8. AI / nutrition / budget

**Decision**: Remain deferred, not waived. Engine never creates Recipes or
calls AI. Incomplete coverage → empty suggestion + `NO_SAFE_CANDIDATES` /
`NO_SAFE_ALTERNATIVE`.

**Rationale**: Constitution Hybrid Recipe Sourcing + spec FR-012/FR-013;
aligned with `008` remediation.

**Alternatives considered**:
- Add AI fallback in `011` — rejected (out of scope + behavior change).
