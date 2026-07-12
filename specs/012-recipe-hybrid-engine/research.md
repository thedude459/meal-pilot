# Research: Recipe Hybrid Engine

**Feature**: `012-recipe-hybrid-engine` | **Date**: 2026-07-12

## 1. Exposure and orchestration

**Decision**: Internal service only. No new organizer-facing generate/substitute
HTTP routes. Do **not** change GenerateWeeklyMeals (`008`) to auto-call hybrid
fill. Planning workflows may wire the engine later.

**Rationale**: Clarifications Q1–Q2. Mirrors MealSuggestionEngine (`011`)
bounded ownership pattern and keeps workflow contracts stable.

**Alternatives considered**:
- Auto-wire GenerateWeeklyMeals shortfall → hybrid fill — rejected (Q1).
- Organizer-facing generate/substitute UI/API — rejected (Q2).

## 2. Delivery shape

**Decision**:
- Own `src/domain/recipe-hybrid.ts` (pure accept/retry/substitute/soft-tag
  logic) and `src/services/recipe-hybrid-service.ts` (load prefs, call generator
  port, validate, persist via RecipeService).
- Extend `recipe.ts` / `RecipeService` with an AI-safe normalize + persist path
  that sets `source = 'ai'` without weakening curated create/replace (which
  continues to force `curated`).
- Reuse preference hard-filter helpers from `meal-suggestion.ts` (dietary IDs +
  dislike phrase/token match).
- Add dedicated unit, integration, and contract tests under `012`.
- Include P3 seasonal/budget soft guidance in this feature (after P1/P2).

**Rationale**: Spec + clarifications Q5; Speckit modularity; shared schema from
`003`; preference rules locked in `011`.

**Alternatives considered**:
- Separate AI recipe table — rejected; constitution shared schema / one library.
- Defer seasonal/budget — rejected (Q5 Option B).

## 3. AI generator port (testability)

**Decision**: Define `RecipeAiGenerator` as an injectable port:

```text
generate(request) → raw recipe candidate fields (pre-validation)
```

- Default tests use a deterministic fake/stub.
- Production may bind a real model adapter later without changing accept rules.
- Engine owns retry (≤3 attempts/slot), schema validation, preference gate, and
  persistence—not the provider.

**Rationale**: Constitution allows AI non-determinism only on generation;
validation must stay deterministic and testable without live network in CI.

**Alternatives considered**:
- Hard-code a live provider in the service — rejected (CI flaky, blocks TDD).
- Persist unvalidated provider output — rejected (Hybrid Recipe Sourcing).

## 4. Retry budget

**Decision**: Per requested recipe slot, maximum **3** total generation attempts
(including the first). Schema or preference failure → discard candidate, retry
until budget exhausted → leave slot unmet and report shortfall. Never persist
invalid/unsafe candidates.

**Rationale**: Clarification Q3 Option B.

**Alternatives considered**:
- No retries / 5 retries / caller-specified — rejected by clarification.

## 5. Preference and schema validation

**Decision**:
- Schema: same structural rules as curated recipes (title, ingredients with
  catalog units, steps, field limits, dietary catalog IDs, cuisine tag rules)
  via an AI normalize path that forces `source = 'ai'` (does not use curated
  force-curated normalizer for acceptance).
- Preference: reuse `011` hard rules — every household hard restriction ID ∈
  `dietaryAttributeIds`; dislike phrase/token match against title + ingredient
  names excludes the candidate.
- Empty members / empty prefs: evaluable; zero hard restrictions → dietary
  hard-match vacuously OK; schema still required.
- Zero FamilyMembers: still allow generation (unlike GenerateWeeklyMeals refuse)
  with empty hard/dislike sets, unless a later caller policy refuses—engine
  itself validates against the loaded aggregate (possibly empty). Spec edge case
  says generation still runs.

**Rationale**: Spec FR-002/FR-003 + Assumptions; keep one preference semantics.

**Alternatives considered**:
- Softer AI dietary rules — rejected (constitution).
- Duplicate matcher implementation — rejected (drift risk vs `011`).

## 6. Substitution modes

**Decision**:
- v1: exactly **one** ingredient per request; caller MUST supply structured
  `replacement` `{ name, quantity, unitId }` (no free-text / generator-invented
  replacement path).
- Default: create distinct library recipe with `source = ai`; original unchanged.
- Replace-in-place: allowed **only** when target `source === 'ai'`; remains AI.
- Replace-in-place on curated → reject with clear error; curated unchanged.
- Substituted result must pass same schema + preference gates before write.
- Unknown target ingredient name → reject; original unchanged.
- Multi-ingredient batches deferred (sequential caller requests).

**Rationale**: Clarification Q4 Option A; analyze remediation I1/U1 — align
spec, contract, and tasks on a single testable path; protect curated authorship
(`003`).

**Alternatives considered**:
- Allow curated in-place keep curated / flip to ai — rejected by clarification.
- Free-text replacement resolved by generator — rejected (analyze U1; v1 requires
  structured replacement).
- Multi-ingredient in one request — deferred; sequential requests suffice.

## 7. Seasonal / budget soft guidance (P3)

**Decision**: Optional request fields `seasonalGuidance` and/or `budgetGuidance`
(short free-text or label strings). On successful acceptance, reflect guidance
in `cuisineTags` (normalized via existing cuisine tag rules) when not already
present—never as a second schema and never overriding hard preference failures.
Absence of guidance does not change generation requirements.

**Rationale**: Spec US4 + clarification Q5; avoids new metadata columns.

**Alternatives considered**:
- New budget/season columns on Recipe — rejected (schema split).
- Hard-filter by budget — rejected (soft guidance only).

## 8. Persistence and capacity

**Decision**: Persist accepted AI recipes through RecipeService into existing
`recipes` table with `source = 'ai'`. Enforce `MAX_RECIPES_PER_HOUSEHOLD` (500)
with existing library-full error semantics before insert. No ephemeral plan-only
AI meals in v1.

**Rationale**: Spec FR-004/FR-010; MealSuggestionEngine already selects any
library source.

**Alternatives considered**:
- Ephemeral AI without library id — rejected by Assumptions.
- New table — rejected (shared schema).

## 9. Error codes (domain)

**Decision** (extend `errors.ts` as needed):

| Code | When |
|------|------|
| `VALIDATION_ERROR` | Bad request shape / unknown ingredient for substitute |
| `RECIPE_LIBRARY_FULL` | Cap would be exceeded |
| `HYBRID_GENERATION_FAILED` | Provider failure or 3 unsafe/invalid attempts for a slot |
| `HYBRID_REPLACE_CURATED_FORBIDDEN` | Replace-in-place on curated recipe |
| `NOT_FOUND` | Substitute target recipe missing |

Hybrid fill partial success returns accepted recipes + unmet count/reasons
without throwing when some slots succeed (result object). Total failure of a
single-recipe generate may throw or return empty+reason—contract prefers a
result envelope for fill; single generate may use the same envelope.

**Rationale**: Align with existing DomainError patterns; keep caller messaging
clear (FR-012).

## 10. Contracts strategy (no new HTTP)

**Decision**: Publish internal service contract YAML
`contracts/recipe-hybrid-engine.service.yaml` describing operations
`generateRecipe`, `hybridFill`, `substituteIngredient`. Contract tests assert
service method presence and envelope shapes. No OpenAPI additions.

**Rationale**: Same pattern as `011`; clarifications forbid new organizer HTTP.

**Alternatives considered**:
- Public REST generate endpoints — rejected (Q2).

## 11. Testing strategy

**Decision**:
- Unit: AI normalize, preference accept/reject, retry counting, substitution
  modes, soft tag merge, determinism of validation on identical payloads.
- Integration: fake generator → persist AI recipe; fill shortfall; library full;
  household isolation; curated replace forbidden.
- Contract: YAML operations map to `RecipeHybridService` methods.
- Quickstart: programmatic service smoke with stub generator (no live AI required).

**Rationale**: Matches `001`–`011` Vitest layout; CI stays offline-friendly.
