# Research: Generate Weekly Meals

**Feature**: `008-generate-weekly-meals` | **Date**: 2026-07-12

## 1. Persistence: workflow over existing WeeklyPlan

**Decision**: No new generation/run table. `MealSuggestionEngine` creates or
reuses `weekly_plans` and writes `meal_slots` via WeeklyPlanService primitives
(assign/replace with `pending`). Generation report is response-only (not
persisted).

**Rationale**: Spec writes into WeeklyPlan; durable audit of generation runs is
not required for v1 acceptance. Avoids dual sources of truth.

**Alternatives considered**:
- `generation_runs` history table — useful later for debugging; deferred.
- Parallel “suggested plan” entity — rejected by FR-008.

## 2. Generate API shape and modes

**Decision**:
- `POST /weekly-plans/generate` with body:
  `{ "weekStartDate": "YYYY-MM-DD", "mode": "fill-empty" | "regenerate-non-approved" }`
- `mode` optional; default `fill-empty`.
- No day-subset field (clarification).
- Response `200`:
  `{ "plan": WeeklyPlan, "report": { mode, filledDays[], unfilledDays[{ day, reason }] } }`
- Creates plan if missing (subject to 104 cap); reuses if present.

**Rationale**: Nested under `/weekly-plans` keeps week identity with the entity
module; report satisfies FR-017 without a second GET.

**Alternatives considered**:
- `POST /generate-weekly-meals` top-level — fine but less discoverable next to
  plans; rejected for cohesion with `007`.
- Always `201` on create — ambiguous when reuse; use `200` for both with plan
  identity in body.

## 3. Eligible days by mode

**Decision**:
- `fill-empty`: all days with no slot row (empty).
- `regenerate-non-approved`: all days that are empty OR status `pending` OR
  `rejected`. Never touch `approved`.
- Process days in Monday→Sunday order for determinism.

**Rationale**: Matches FR-005 and clarification (all eligible days).

**Alternatives considered**:
- Day-subset parameter — rejected by clarification Option A.
- Regenerate pending only (not rejected) — weaker draft refresh; rejected.

## 4. Preference hard filters

**Decision**:
- Union hard restrictions and dislikes across all household members.
- **Dietary**: Recipe is safe only if every required restriction ID appears in
  `recipe.dietaryAttributeIds` (catalog ID equality). Empty restriction set →
  no dietary filter.
- **Dislikes**: Normalize label and haystacks to lowercase; collapse internal
  whitespace. A dislike matches when:
  1. Exact equality with Recipe title or any ingredient `name`, or
  2. Dislike equals a whitespace/punctuation-delimited token in title or
     ingredient name, or
  3. Multi-word dislike appears as a contiguous phrase of tokens in title or
     ingredient name.
- No fuzzy/NLP matching.
- Household with zero FamilyMembers → `GENERATION_NO_PREFERENCES` (400). An
  existing member with empty likes/dislikes/restrictions remains evaluable
  (all-empty profile is allowed).

**Rationale**: Clarification Option B for dislikes; Recipe tags already share
PreferenceProfile catalog IDs (`003`). Empty likes/dislikes/restrictions on a
real member still constitutes “evaluable input.”

**Alternatives considered**:
- Title-only dislike match — weaker; rejected by clarification.
- Soft-only dislikes — rejected by constitution/spec hard exclusions.
- Require ≥1 restriction or dislike filled — over-blocking; rejected.

## 5. Soft ranking and deterministic assignment

**Decision**: Score each safe candidate (higher is better), then greedy assign
Mon→Sun:

| Signal | Score contribution |
|--------|-------------------|
| Likes | +2 per like matching title/ingredients (same matcher as dislikes) |
| Pantry | +1 × (matched pantry ingredient names / recipe ingredient count); 0 if no ingredients or empty pantry |
| Timing | Prefer lower `prepTimeMinutes + cookTimeMinutes` when both/either present: `+ max(0, 120 - totalMinutes) / 120` (missing timing → 0 timing bonus) |
| Cuisine variety | +0.5 if recipe’s first cuisine tag is not yet used in this week’s assignments |
| Rotation | −5 if `recipeId` appears in current week assignments or in household plans whose `weekStartDate` is in `[targetWeekStart - 14 days, targetWeekStart)` (prior 2 weeks); −3 if already chosen earlier today in greedy pass |

Tie-break: higher score first; then `recipeId` ascending (UUID string compare).

**Soft relax**: If no candidate remains after applying rotation penalties as hard
exclusions for that day, retry without rotation exclusions (keep dietary/dislike
hard filters). If still none → leave day unfilled with reason
`NO_SAFE_CANDIDATES`.

**Difficulty / nutrition**: No separate Recipe difficulty or nutrition fields
exist. Use total prep+cook minutes as the preparation-difficulty proxy. Cuisine
tags provide within-week diversity. Nutrition-oriented scoring is deferred
(not waived) until metadata exists.

**Rationale**: Deterministic, library-only, implements FR-004/FR-010/FR-013
without ML. Rotation window matches assumption (current + prior 2 weeks).

**Alternatives considered**:
- Random among top-N — non-deterministic; rejected.
- Global ILP optimizer — overkill for ≤500×7; rejected.
- Hard no-repeat within week — may empty days too often; soft+relax preferred.

## 6. Reject → alternative (same flow)

**Decision**: Extend `PUT /weekly-plans/{id}/slots/{day}/status` when
`status === "rejected"`:
1. Validate filled slot (existing `007` rules).
2. Compute one alternative: safe candidates excluding current `recipeId`,
   applying same filters/ranking/rotation soft-relax, considering other days’
   current assignments.
3. If found: assign/replace that Recipe on the day with `pending` (do not leave
   durable `rejected`).
4. If not found: persist `rejected` with prior Recipe; include outcome in
   response.
5. Response remains a WeeklyPlan document plus:
   `alternativeOutcome: { applied: true } | { applied: false, reason: "NO_SAFE_ALTERNATIVE" }`
   when the requested status was `rejected`. Other status changes omit the
   field (or set null).

Approve / pending status paths unchanged from `007`.

**Rationale**: Clarification Option A (automatic alternative). Extending the
existing status route avoids a second organizer action and keeps WeeklyPlan as
the only store.

**Alternatives considered**:
- Separate `POST .../suggest-alternative` — rejected by clarification.
- Return candidate list for picker — out of scope (FR-007).
- New reject-only endpoint — duplicates status semantics; rejected.

## 7. Error and unfilled reasons

**Decision**:

| Code / reason | When |
|---------------|------|
| `VALIDATION_ERROR` (400) | Missing/non-Monday `weekStartDate`, invalid `mode`, malformed body |
| `GENERATION_NO_PREFERENCES` (400) | No household FamilyMembers to evaluate |
| `WEEKLY_PLAN_LIBRARY_FULL` (409) | Generate would create a new plan but household already at 104 |
| `NOT_FOUND` (404) | Unknown plan on reject path |
| `NO_SAFE_CANDIDATES` | Unfilled day / failed alternative (report reason, not always HTTP error) |

Partial generate success is still HTTP `200` with `unfilledDays` populated.

**Rationale**: Aligns with prior feature error split; partial coverage must not
fail the whole request (FR-017).

**Alternatives considered**:
- `422` for no preferences — less consistent with existing 400 validation
  family; use dedicated code on 400 instead.

## 8. AI hybrid deferred (not waived)

**Decision**: Engine never creates Recipes or calls AI. Incomplete coverage →
empty days + report. `Recipe.source` may already be `ai` from future features;
v1 may still select existing library rows regardless of source, but MUST NOT
create new AI rows. Constitution Hybrid Recipe Sourcing remains mandatory as a
follow-on (`RecipeHybridEngine`).

**Rationale**: Clarification Option B; post-analyze remediation accepts
deferred-not-waived (same pattern as BuildGroceryList).

**Alternatives considered**:
- Best-effort AI fallback in v1 — rejected by clarification.
- Waive constitution hybrid permanently — rejected; deferred only.

## 9. Testing strategy

**Decision**: Pure unit tests for matcher, filter, scorer, greedy assign;
integration tests seed members/preferences/recipes/pantry/plans and assert
slot outcomes + reports; contract tests for generate + reject alternative
envelope. Fix fixtures so ranking assertions are stable (control recipe IDs /
titles).

**Rationale**: Matches `001`–`007` Vitest layout; determinism enables exact
asserts.
