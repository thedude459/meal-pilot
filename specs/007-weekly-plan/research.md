# Research: Weekly Plans

**Feature**: `007-weekly-plan` | **Date**: 2026-07-12

## 1. Persistence shape for plans and slots

**Decision**: Two tables:
- `weekly_plans`: `id`, `household_id`, `week_start_date` (TEXT ISO date),
  timestamps. Unique `(household_id, week_start_date)`.
- `meal_slots`: `id`, `weekly_plan_id`, `day` (monday…sunday), `recipe_id`,
  `status` (pending|approved|rejected), timestamps. Unique
  `(weekly_plan_id, day)`. Empty days = no row.

**Rationale**: Per-slot assign/clear/status without rewriting other days maps
cleanly to row upsert/delete. `recipe_id` index supports Recipe delete in-use
checks. Avoids JSON blob merge bugs.

**Alternatives considered**:
- JSON `slots` column on `weekly_plans` — harder per-slot concurrency and
  Recipe FK lookup; rejected.
- Always materialize seven empty rows — more writes for empty plans; rejected
  in favor of sparse filled-only rows.

## 2. Monday week-start validation

**Decision**: Accept `weekStartDate` as `YYYY-MM-DD`. Parse as a calendar date
in UTC (`Date.UTC(y, m-1, d)`) and require `getUTCDay() === 1` (Monday). Reject
non-ISO shapes and non-Mondays with `VALIDATION_ERROR`. Do not localize to
server TZ. Past and future Mondays are allowed.

**Rationale**: Spec requires ISO-style Monday week-start; UTC calendar check
avoids DST/local-midnight surprises. Clarification allows past weeks.

**Alternatives considered**:
- Local-timezone weekday check — environment-dependent; rejected.
- Reject past weeks — rejected by clarification Option A.
- Accept Sunday-start — rejected by spec assumptions.

## 3. Per-slot API model

**Decision**:
- `PUT /weekly-plans/{id}/slots/{day}` with `{ "recipeId": "<uuid>" }` —
  assign or replace; always sets `status` to `pending`. Other days untouched.
- `DELETE /weekly-plans/{id}/slots/{day}` — clear (delete meal_slots row).
- `PUT /weekly-plans/{id}/slots/{day}/status` with
  `{ "status": "pending"|"approved"|"rejected" }` — status only; Recipe
  unchanged. Empty slot → `VALIDATION_ERROR`.
- No full replace of all seven slots as the required edit model.
- No endpoint to change `weekStartDate` after create (immutability by absence
  of any plan-level week-start update API; organizers create a new plan for a
  different week).

**Rationale**: Clarification Option C; mirrors GroceryItem dedicated toggle vs
entity replace pattern.

**Alternatives considered**:
- Full replace of all slots — rejected by clarification.
- PATCH with arbitrary fields — inconsistent with prior style.
- Bundle status into assign body — status changes would force resending recipe;
  rejected for dedicated status action.

## 4. Create with optional initial slots

**Decision**: `POST /weekly-plans` requires `weekStartDate`. Optional
`slots: [{ day, recipeId }, …]` (0–7). Duplicate `day` in one payload →
`VALIDATION_ERROR`. Unknown Recipe → `NOT_FOUND`. Each filled slot starts
`pending`. Week-start-only create inserts plan with zero slot rows.

**Rationale**: Spec allows empty create and create with assignments; FR-001 /
clarification Option A.

**Alternatives considered**:
- Require ≥1 filled slot — rejected by clarification.
- Always create seven empty rows — unnecessary; rejected.

## 5. Same Recipe on multiple days

**Decision**: No uniqueness on `(weekly_plan_id, recipe_id)`. Unique only on
`(weekly_plan_id, day)`.

**Rationale**: Clarification Option A (leftovers / batch cook).

**Alternatives considered**:
- Reject duplicate Recipe in week — rejected by clarification.

## 6. Capacity and conflict errors

**Decision**:
- Create when household already has 104 plans → `WEEKLY_PLAN_LIBRARY_FULL`
  (409)
- Create when `(household_id, week_start_date)` exists →
  `WEEKLY_PLAN_CONFLICT` (409)
- Malformed date, non-Monday, invalid day enum, invalid status, status on
  empty slot, missing required fields, unexpected properties on slot/status
  bodies → `VALIDATION_ERROR` (400)
- Unknown plan or Recipe (well-formed UUID absent in household) → `NOT_FOUND`
  (404)

**Rationale**: Parallel to Recipe library full / Ingredient conflict patterns.

**Alternatives considered**:
- Single error code — weaker contracts.

## 7. Recipe delete blocked while on a plan

**Decision**: Add `assertRecipeNotInPlan` in weekly-plan-service (or shared
assert called from RecipeService). `deleteRecipe` checks for any `meal_slots`
row with that `recipe_id` in the household’s plans. If present →
`RECIPE_IN_USE` (409); do not cascade-clear slots.

**Rationale**: FR-011; mirrors Ingredient `INGREDIENT_IN_USE` for grocery/
pantry.

**Alternatives considered**:
- Cascade clear slots — rejected by spec.
- Orphan recipe references — rejected by spec.
- Reuse `INGREDIENT_IN_USE` — wrong entity; rejected.

## 8. List and detail response shape

**Decision**:
- List: `{ items: WeeklyPlanSummary[], maxWeeklyPlans: 104 }` ordered by
  `week_start_date` descending. Summary includes id, weekStartDate,
  filledSlotCount (optional convenience), timestamps.
- Detail: always returns seven calendar-ordered days Monday–Sunday. Empty days
  appear as `{ day, recipeId: null, recipeTitle: null, status: null }`. Filled
  days include recipeId, current recipeTitle, status.
- List summaries include `filledSlotCount` (0–7) as a convenience field
  (normative for this feature’s list contract).

**Rationale**: Spec acceptance requires seeing empty slots on detail; sparse
storage + materialize empties on read. `filledSlotCount` supports list UX
without loading all slots.

**Alternatives considered**:
- Return only filled slots — weaker match to “each day Monday–Sunday” acceptance.
- Search/filter — out of scope for v1.

## 9. Status terminology

**Decision**: Canonical enum values `pending`, `approved`, `rejected`. Do not
use `suggested` in this feature.

**Rationale**: Clarification Option A; leaves room for engine-proposed
`suggested` in GenerateWeeklyMeals later.

**Alternatives considered**:
- Rename to suggested — rejected by clarification.
- Dual pending+suggested with same behavior — unnecessary complexity now.

## 10. Out of scope confirmation

**Decision**: Do not implement GenerateWeeklyMeals, preference/rotation scoring,
post-reject alternatives, breakfast/lunch/dinner multi-slots, BuildGroceryList
from approved meals, or grocery/pantry mutation. Those constitution consumers
remain mandatory follow-on features (see plan **Follow-on features**).

**Rationale**: Spec FR-012–FR-015 and assumptions.
