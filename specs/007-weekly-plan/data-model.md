# Data Model: Weekly Plans

**Feature**: `007-weekly-plan` | **Date**: 2026-07-12

## Entities

### WeeklyPlan

Household-scoped structured meal list for one calendar week.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| householdId | string (UUID) | FK → Household; scopes library |
| weekStartDate | string (date) | ISO `YYYY-MM-DD`; MUST be Monday; unique per household; immutable after create |
| slots | MealSlotView[7] | Read model: always Monday–Sunday in order (see MealSlot) |
| createdAt | datetime | Set on create |
| updatedAt | datetime | Bumped on successful create with slots, assign, clear, or status |

**Relationships**:
- Belongs to one Household
- Contains up to seven MealSlots (one per weekday); sparse storage for filled
  days only

**Uniqueness**:
- At most one WeeklyPlan per `(householdId, weekStartDate)`
- Conflicts on create → `WEEKLY_PLAN_CONFLICT`

**Validation (on create)**:
1. `weekStartDate` required, ISO `YYYY-MM-DD`, UTC weekday Monday → else
   `VALIDATION_ERROR`
2. Past/current/future Mondays all allowed
3. Optional `slots` array: each entry requires `day` + `recipeId`; duplicate
   `day` in payload → `VALIDATION_ERROR`
4. Each `recipeId` must exist in household → else `NOT_FOUND`
5. Household plan count < 104 → else `WEEKLY_PLAN_LIBRARY_FULL`
6. Filled slots start with status `pending`
7. Failed validation inserts nothing

### MealSlot (within WeeklyPlan)

One day’s meal assignment. Stored only when filled.

| Field | Type | Notes |
|-------|------|-------|
| day | enum | `monday` … `sunday` (one per plan) |
| recipeId | string (UUID) \| null | Null when empty (read model only); required when filled |
| recipeTitle | string \| null | Read-only; current Recipe title when filled |
| status | enum \| null | `pending` \| `approved` \| `rejected` when filled; null when empty |

**Relationships**:
- Belongs to one WeeklyPlan
- References at most one household Recipe when filled
- Same Recipe MAY appear on multiple days in one plan

**Uniqueness**:
- At most one slot per `(weeklyPlanId, day)`

**Validation (assign/replace)**:
1. Plan must exist in household → else `NOT_FOUND`
2. `day` must be a known weekday enum → else `VALIDATION_ERROR`
3. `recipeId` required and must exist in household → else `NOT_FOUND` /
   `VALIDATION_ERROR`
4. Upsert slot; set `status` to `pending`; bump plan `updatedAt`
5. Other days unchanged; last successful assign for that day wins

**Validation (clear)**:
1. Plan must exist → else `NOT_FOUND`
2. Delete slot row if present; clearing an already-empty day is idempotent and
   returns **200** with the full WeeklyPlan (empty day unchanged)
3. Other days unchanged

**Validation (set status)**:
1. Plan must exist → else `NOT_FOUND`
2. Slot must be filled → else `VALIDATION_ERROR`
3. Body requires `status` in `pending` \| `approved` \| `rejected` → else
   `VALIDATION_ERROR`
4. Body must not include `recipeId` → else `VALIDATION_ERROR`
5. Update status only; Recipe unchanged; bump plan `updatedAt`

### Recipe (dependency)

| Field | Role for this feature |
|-------|------------------------|
| id | Linked identity for filled slots |
| title | Detail label (`recipeTitle`) |
| householdId | Must match plan household |

**Delete rule**: `deleteRecipe` MUST fail with `RECIPE_IN_USE` (409) while any
MealSlot in that household references the Recipe.

### Household (dependency)

| Field | Role for this feature |
|-------|------------------------|
| id | Scopes weekly plan library (`DEFAULT_HOUSEHOLD_ID` in v1) |

## State Transitions

```text
[List WeeklyPlans]
  → order by week_start_date DESC
  → return { items, maxWeeklyPlans: 104 }

[Get WeeklyPlan]
  → must exist in household
  → load filled meal_slots; join Recipe titles
  → materialize Monday–Sunday views (empty → null recipe/status)
  → return full WeeklyPlan

[Create WeeklyPlan]
  → validate Monday weekStartDate
  → reject duplicate week → WEEKLY_PLAN_CONFLICT
  → enforce cap 104 → WEEKLY_PLAN_LIBRARY_FULL if at cap
  → insert plan; optionally insert initial slots (status=pending)
  → on failure: no rows

[Assign/Replace Slot]
  → plan exists; recipe exists
  → upsert meal_slots for day with status=pending
  → other days unchanged

[Clear Slot]
  → plan exists
  → delete meal_slots row for day (if any); idempotent if already empty
  → return full WeeklyPlan (200)
  → other days unchanged

[Set Slot Status]
  → plan exists; slot filled
  → update status only
  → other days unchanged

[Delete WeeklyPlan]
  → must exist in household
  → cascade-delete meal_slots for that plan (DB ON DELETE CASCADE or
    service-ordered deletes)
  → subsequent get/list omit it
  → unblocks Recipe delete for recipes only referenced by that plan

[Delete Recipe] (RecipeService)
  → if any meal_slots row references recipe → RECIPE_IN_USE (409)
  → else permanent library delete (existing behavior)
```

### Slot status transitions (filled only)

```text
(assign/replace) → pending
pending  → approved | rejected | pending
approved → pending | rejected
rejected → pending | approved
clear    → (empty: no status)
```

## SQLite mapping (implementation sketch)

### weekly_plans

| Column | SQL type | Notes |
|--------|----------|-------|
| id | text PK | UUID |
| household_id | text not null | indexed |
| week_start_date | text not null | `YYYY-MM-DD` Monday |
| created_at | text/integer | ISO or unix per existing db helpers |
| updated_at | text/integer | bumped on slot mutations |

Unique index: `(household_id, week_start_date)`.

### meal_slots

| Column | SQL type | Notes |
|--------|----------|-------|
| id | text PK | UUID |
| weekly_plan_id | text not null | FK → weekly_plans.id ON DELETE CASCADE |
| day | text not null | monday…sunday |
| recipe_id | text not null | references recipes.id (service-enforced) |
| status | text not null | pending \| approved \| rejected |
| created_at | text/integer | |
| updated_at | text/integer | |

Unique index: `(weekly_plan_id, day)`.

Index: `recipe_id` for Recipe delete lookup; `weekly_plan_id` for plan detail.

## Out of scope (non-entities here)

- GenerateWeeklyMeals / MealSuggestionEngine auto-fill
- Post-reject alternative suggestions
- Breakfast / lunch / dinner multi-slots per day
- BuildGroceryList from approved meals
- Preference / rotation / nutrition scoring on the plan
- Changing week-start after create
- Search/filter beyond newest-first list
- Soft-delete / archive of plans
