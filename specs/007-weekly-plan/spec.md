# Feature Specification: Weekly Plans

**Feature Branch**: `007-weekly-plan`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "WeeklyPlan"

## Clarifications

### Session 2026-07-12

- Q: Can the same Recipe be assigned to more than one day in a single WeeklyPlan? → A: Allow the same Recipe on multiple days in one week
- Q: When creating a WeeklyPlan, can the organizer save with only a week-start date and all seven days empty? → A: Allow create with week-start only (all slots empty)
- Q: How should organizers update meal slots after a plan exists? → A: Per-slot operations: assign/replace recipe, clear slot, and set status independently
- Q: May organizers create a WeeklyPlan for a week whose Monday week-start is already in the past? → A: Allow creating plans for past, current, and future week-starts
- Q: What should the default (not yet decided) status on a filled slot be called? → A: Canonical status name: pending (not suggested)
- Post-analyze remediation (2026-07-12): Week-start immutability is by absence of any plan update API (no reject-response path); list summaries MAY include `filledSlotCount`; slot clear returns the full plan (200), including idempotent clear of an already-empty day

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a weekly plan and assign meals (Priority: P1)

A household organizer creates a WeeklyPlan for a specific week and assigns
household Recipes to day slots so the household has a structured list of meals
to cook and later approve before grocery generation.

**Why this priority**: Without a durable WeeklyPlan entity and meal slots tied
to Recipes, preference-aware planning, approval, and BuildGroceryList have
nothing structured to operate on. Manual plan capture is the minimum viable
WeeklyPlan foundation.

**Independent Test**: Create one weekly plan for a known week-start date with at
least one day slot assigned to an existing household Recipe; reopen the plan and
confirm week identity, slot day, recipe linkage, and default pending-approval
status persist as saved.

**Acceptance Scenarios**:

1. **Given** a household with at least one Recipe and no WeeklyPlan for a chosen
   week-start date, **When** the organizer creates a weekly plan for that
   Monday-start week and assigns a Recipe to one or more day slots (Monday–
   Sunday), **Then** the plan appears for that week and can be opened with those
   assignments intact; each filled slot starts in pending (not yet approved)
   status.
2. **Given** the organizer is creating a weekly plan, **When** they provide only
   a valid Monday week-start and no day assignments, **Then** the plan is saved
   with all seven day slots empty.
3. **Given** the organizer is creating a weekly plan, **When** they omit the
   week-start date, provide a week-start that is not a Monday, reference an
   unknown Recipe, or assign the same day slot twice in one create, **Then**
   the system rejects the create and explains what is required; no partial plan
   is saved.
4. **Given** the household already has a WeeklyPlan for week-start Monday 2026-
   07-13, **When** the organizer tries to create another plan for the same
   week-start, **Then** the system rejects the create and explains that a plan
   for that week already exists; the existing plan is unchanged.
5. **Given** a successfully saved WeeklyPlan, **When** the organizer views it,
   **Then** it is identifiable as a household plan for a specific week (stable
   plan identity independent of later slot changes) with up to seven day slots
   (one per weekday).
6. **Given** a household Recipe already assigned to Monday, **When** the
   organizer also assigns that same Recipe to Wednesday, **Then** both slots
   accept the assignment; the same Recipe MAY appear on multiple days in one
   week.

---

### User Story 2 - Browse and view weekly plans (Priority: P2)

The organizer browses household weekly plans and opens a plan to review which
Recipes are assigned to which days and whether each meal is still pending,
approved, or rejected before shopping or cooking.

**Why this priority**: Visibility confirms the plan is usable and trustworthy;
secondary to the ability to create structured plans.

**Independent Test**: With at least two known weekly plans for different weeks,
open the plan list and one plan detail and confirm week-start dates, day order,
recipe identities, and slot statuses match what was saved.

**Acceptance Scenarios**:

1. **Given** a household with multiple weekly plans, **When** the organizer
   opens the plan list, **Then** each plan is listed and distinguishable by
   week-start date, ordered newest week-start first.
2. **Given** a saved WeeklyPlan with several assigned slots, **When** the
   organizer opens it, **Then** they see week-start date, each day Monday–
   Sunday in calendar order, linked Recipe identity and title when a slot is
   filled, empty slots when unassigned, and each filled slot’s approval status
   (pending, approved, or rejected).
3. **Given** a household with no weekly plans, **When** the organizer opens the
   list, **Then** they see an empty list and can still start creating a plan.

---

### User Story 3 - Modify, approve, or reject meal slots (Priority: P2)

The organizer changes which Recipe is in a day slot, clears a slot, or marks a
filled slot approved or rejected so the plan stays accurate and only approved
meals are ready for later grocery generation. Each change is a per-slot action;
the organizer does not rewrite all seven days to update one day.

**Why this priority**: Plans change as households decide what to cook; approval
is the constitution gate before automatic grocery generation. Depends on plans
already existing.

**Independent Test**: On an existing plan, replace one slot’s Recipe, approve
another slot, reject a third, and clear a fourth—each as a separate per-slot
action; reopen and confirm each outcome; invalid status or recipe changes are
rejected without corrupting other slots.

**Acceptance Scenarios**:

1. **Given** a saved WeeklyPlan with a filled pending slot, **When** the
   organizer assigns a different household Recipe to that day via a per-slot
   assign/replace action, **Then** the slot shows the new Recipe and returns to
   pending status; other days are unchanged.
2. **Given** a filled pending or rejected slot, **When** the organizer marks it
   approved via a dedicated per-slot status action, **Then** the slot status is
   approved and the Recipe assignment is unchanged; other days are unchanged.
3. **Given** a filled pending or approved slot, **When** the organizer marks it
   rejected via a dedicated per-slot status action, **Then** the slot status is
   rejected and the Recipe assignment remains until the organizer replaces or
   clears it (alternative suggestions are out of scope for this feature).
4. **Given** a filled slot, **When** the organizer clears the day via a per-slot
   clear action, **Then** the slot becomes empty with no Recipe and no approval
   status; other days are unchanged.
5. **Given** an already-empty day, **When** the organizer clears that day,
   **Then** the plan remains unchanged with that day empty (idempotent clear);
   other days are unchanged.
6. **Given** an empty slot, **When** the organizer tries to approve or reject
   it, **Then** the system rejects the status change and explains that a Recipe
   must be assigned first.
7. **Given** the organizer submits an invalid slot change (unknown Recipe,
   unknown day, unknown plan, or invalid status value), **When** they save,
   **Then** the system rejects the change and leaves the prior plan unchanged.
8. **Given** a saved WeeklyPlan, **When** the organizer needs a different
   week-start, **Then** they create a new plan for that week; this feature
   provides no plan-level update that changes week-start (week identity is
   fixed at create time by absence of any week-start update API).

---

### User Story 4 - Remove a weekly plan (Priority: P3)

The organizer permanently removes a WeeklyPlan the household no longer needs so
stale weeks do not clutter the list.

**Why this priority**: Plan hygiene keeps the library trustworthy but depends on
plans already existing; less critical than create/view/approve.

**Independent Test**: Delete one weekly plan and confirm it no longer appears in
list or detail; other weeks’ plans remain.

**Acceptance Scenarios**:

1. **Given** a saved WeeklyPlan, **When** the organizer permanently deletes it
   (any UI confirmation is outside this feature’s API), **Then** the plan is
   removed and no longer appears in list or detail views.
2. **Given** multiple weekly plans, **When** the organizer deletes one, **Then**
   the other plans remain unchanged.

---

### Edge Cases

- Creating a plan for a week-start that is not Monday is rejected; no partial
  plan is saved.
- Past, current, and future Monday week-starts are all allowed; there is no
  restriction against creating a plan for a week already in the past.
- At most one WeeklyPlan per household per week-start date; duplicate week
  creates are rejected.
- Empty plans (all seven days unassigned) are allowed after create or after
  clearing slots; approval requires a filled slot.
- The same Recipe MAY be assigned to multiple days in one WeeklyPlan; there is
  no per-plan uniqueness constraint on Recipe identity across slots.
- Assigning a Recipe that later is deleted from the library: Recipe delete is
  blocked while any WeeklyPlan slot in the household references it; no silent
  cascade or orphan slots.
- Renaming a Recipe does not change slot linkage (identity is stable); plan
  display shows the Recipe’s current title on read.
- Concurrent slot updates on the same plan: last successful per-slot action
  wins for that slot; no field-level merge across overlapping edits to the same
  day. Unrelated days are not rewritten by a single-slot action.
- Clearing an already-empty day is idempotent and leaves the plan unchanged.
- There is no plan-level update API for week-start; organizers create a new
  plan for a different week instead.
- Household plan count limits: creates beyond the household weekly-plan cap are
  rejected without creating a partial entry.
- This feature does not auto-generate plans from preferences
  (GenerateWeeklyMeals), propose alternatives after rejection, enforce variety/
  nutrition/rotation scoring, or build grocery lists from approved meals; those
  workflows consume WeeklyPlan later.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a household organizer to create a WeeklyPlan for
  a household-scoped week identified by a Monday week-start date, with zero to
  seven day slots (Monday–Sunday). Create with week-start only (all slots empty)
  MUST be allowed and MUST NOT be rejected solely because no days are filled.
  Each filled slot MUST reference an existing household Recipe and MUST start in
  pending approval status. Empty slots MUST be allowed. Past, current, and
  future Monday week-starts MUST all be accepted.
- **FR-002**: System MUST reject creates that omit week-start date, use a
  week-start that is not Monday, reference an unknown Recipe, assign the same
  weekday more than once, or would exceed the household plan cap; invalid
  requests MUST NOT partially save.
- **FR-003**: System MUST enforce at most one WeeklyPlan per week-start date per
  household; a create that would duplicate an existing week MUST be rejected
  without changing the existing plan. System MUST NOT require Recipe uniqueness
  across days within a plan; the same Recipe MAY fill multiple day slots.
- **FR-004**: System MUST support per-slot operations on an existing WeeklyPlan:
  (1) assign or replace a Recipe on one day, (2) clear one day slot, and
  (3) set one filled slot’s approval status to pending, approved, or rejected.
  Canonical status names MUST be pending, approved, and rejected (not
  “suggested”). Replacing a Recipe on a slot MUST reset that slot’s status to
  pending. Clearing a slot MUST remove Recipe and status for that day only;
  clearing an already-empty day MUST be idempotent (plan unchanged).
  Approve/reject/pending on an empty slot MUST be rejected. A per-slot action
  MUST NOT rewrite other days. Full replace of all seven slots in one update is
  not the required edit model for this feature.
- **FR-005**: System MUST allow organizers to list all household WeeklyPlans
  (newest week-start first) and open any WeeklyPlan by identity to view its
  current fields. List summaries MAY include a `filledSlotCount` (0–7) convenience
  field. Search and filter beyond list ordering are out of scope for v1.
- **FR-006**: System MUST treat week-start as immutable after create by providing
  no plan-level update API that changes week identity. Organizers who need a
  different week MUST create a new WeeklyPlan for that week-start.
- **FR-007**: System MUST allow organizers to permanently remove a WeeklyPlan
  from the household; removed plans MUST NOT appear in subsequent list or
  detail views. Any confirm-before-delete prompt is a client/UI concern and is
  not a separate API of this feature.
- **FR-008**: System MUST preserve WeeklyPlan identity across slot and status
  changes and MUST scope plans per household; one household’s plans MUST NOT be
  visible or editable as another household’s.
- **FR-009**: System MUST enforce field and list limits: max 104 WeeklyPlans per
  household (about two years of weeks); max one slot per weekday per plan;
  creates beyond the cap MUST be rejected with a clear limit explanation.
- **FR-010**: System MUST show linked Recipe title with each filled slot on plan
  detail so organizers can recognize meals without memorizing identifiers.
- **FR-011**: System MUST block deletion of a household Recipe while any
  WeeklyPlan slot in that household references it; the organizer MUST clear or
  reassign that slot (or remove the plan) first. Recipe delete MUST NOT
  cascade-clear plan slots and MUST NOT leave orphan recipe references.
- **FR-012**: System MUST NOT automatically generate WeeklyPlans from family
  preferences, pantry data, rotation rules, budget, or AI suggestions in this
  feature; GenerateWeeklyMeals and MealSuggestionEngine remain separate
  follow-on capabilities that MUST write into WeeklyPlan.
- **FR-013**: System MUST NOT automatically propose alternative Recipes when a
  slot is rejected in this feature; rejection only records status for later
  suggestion workflows.
- **FR-014**: System MUST NOT create or modify GroceryItems from approved slots
  in this feature; BuildGroceryList remains a separate constitution workflow
  that MUST consume approved WeeklyPlan meals later.
- **FR-015**: System MUST treat each day slot as at most one meal assignment for
  v1 (dinner-oriented single slot per day). Multiple meal types per day
  (breakfast/lunch/dinner) are out of scope for this feature.

### Key Entities *(include if feature involves data)*

- **WeeklyPlan**: A household-scoped structured list of meals for one calendar
  week. Has stable identity, required Monday week-start date (unique per
  household), and up to seven day slots (Monday–Sunday). Used later by
  GenerateWeeklyMeals writers and BuildGroceryList readers of approved meals.
- **MealSlot (within WeeklyPlan)**: One day’s meal assignment on a WeeklyPlan.
  Optional link to a household Recipe; when filled, has approval status
  **pending**, approved, or rejected (canonical default name is pending, not
  suggested). At most one slot per weekday per plan in v1. The same Recipe MAY
  appear on multiple MealSlots within one plan.
- **Recipe (dependency)**: Household library meal definition from the Recipes
  feature; required reference for every filled slot; supplies display title on
  read.
- **Household (dependency)**: Scopes the weekly plan library (same household
  boundary as FamilyMember, Recipe, Ingredient, PantryItem, and GroceryItem).

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences, dietary restrictions, and dislikes MUST be honored by later
  GenerateWeeklyMeals / suggestion consumers; this feature stores the resulting
  plan and approval decisions and does not evaluate preferences itself.
- Weekly meal plans MUST balance variety, nutrition, and preparation difficulty
  under Balanced Weekly Planning; scoring, rotation, and auto-generation are out
  of delivery scope here but remain mandatory follow-on constitution behavior
  that MUST write into WeeklyPlan.
- Grocery lists MUST derive from approved meals and subtract pantry inventory;
  this feature supplies approved slot meals those workflows will read. Automatic
  grocery generation is out of delivery scope here.
- AI-generated recipes MUST share the curated schema and pass dietary
  validation; this feature only references existing Recipes and does not change
  recipe schema or AI generation.
- Non-AI behavior MUST remain deterministic.
- Business logic for WeeklyPlan MUST live in Speckit specs/workflows only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Organizers can create a weekly plan with a Monday week-start (with
  or without day assignments), leave and return, and see 100% of week identity,
  day assignments, recipe titles, and pending statuses persisted as saved;
  week-start-only creates show all seven slots empty.
- **SC-002**: Organizers can complete creating a typical weekly plan (week-start
  plus assigning Recipes to most days) in under 5 minutes without assistance.
- **SC-003**: Invalid creates and per-slot updates (non-Monday week-start,
  duplicate week, unknown Recipe, approve/reject/pending on empty slot, over
  plan limits) are rejected 100% of the time with a clear explanation, and no
  partial plan corruption is written. Week-start remains immutable because no
  plan-level week-start update API exists (organizers create a new plan instead).
- **SC-004**: In usability checks, at least 90% of organizers can locate a known
  weekly plan in a list of 10+ weeks and open its detail on the first attempt.
- **SC-005**: Duplicate WeeklyPlans for the same week-start within a household
  are prevented 100% of the time.
- **SC-006**: After confirmed removal, the weekly plan is absent from list and
  detail on 100% of subsequent views.
- **SC-007**: Reopening a plan shows the same slot Recipes and approval
  statuses as last successfully saved on 100% of checks.
- **SC-008**: Organizers can approve a filled slot and see approved status on
  plan detail on 100% of subsequent views until the slot is rejected, replaced
  (reset to pending), or cleared.

## Assumptions

- Target user is the household organizer (same actor model as Family Member,
  Preference Profile, Recipe, Ingredient, PantryItem, and GroceryItem features).
- Week identity uses an ISO-style Monday week-start date; Sunday-start weeks are
  out of scope for v1.
- Create with week-start only (all seven slots empty) is allowed; organizers may
  fill slots later.
- Past, current, and future Monday week-starts are all allowed for create; no
  “current week only” restriction in v1.
- v1 uses one meal slot per calendar day (seven slots max per plan), oriented
  around the household’s main daily meal. Separate breakfast/lunch/dinner tracks
  are deferred.
- Approval statuses for filled slots are exactly: pending (default on assign/
  replace), approved, and rejected. Empty slots have no status. Canonical name
  is **pending** (not “suggested”); GenerateWeeklyMeals may introduce a distinct
  suggested/engine-proposed concept later without renaming this status.
- The same Recipe MAY be used on multiple days within one WeeklyPlan (no
  per-plan Recipe uniqueness).
- Rejecting a meal does not auto-suggest alternatives in this feature;
  GenerateWeeklyMeals / MealSuggestionEngine will consume rejected status later.
- GenerateWeeklyMeals (preference evaluation, candidate generation, constraint
  filtering, rotation rules) is out of delivery scope; this feature owns manual
  WeeklyPlan CRUD, slot assignment, and approval status only. That constitution
  workflow remains a mandatory follow-on that MUST write into WeeklyPlan.
- BuildGroceryList from approved meals, pantry subtraction, and export remain
  out of delivery scope and MUST consume approved WeeklyPlan slots later.
- Catalog Recipes must already exist before they can be assigned to a slot;
  creating Recipes inline during plan edit is out of scope.
- Changing week-start after create is out of scope; there is no plan update API
  for week identity—organizers create a plan for the desired week.
- Household WeeklyPlan cap is 104 plans (approximately two years).
- Concurrent slot edits use last-successful per-slot-action semantics for that
  day (aligned with other entity features’ last-write-wins). Slot updates are
  per-slot assign/replace, clear, or status actions—not a mandatory full
  replace of all seven days. Clear of an already-empty day is idempotent.
- List browse is newest week-start first; list summaries MAY include
  `filledSlotCount` (0–7). Text search/filter is deferred beyond v1.
- SC-002 and SC-004 are manual UX outcomes (time-to-create and findability
  demos), not automated harness gates.
- Multi-household auth and switching remain as established by earlier features;
  this feature only enforces per-household plan isolation.
- Recipe library delete is blocked while a WeeklyPlan slot references that
  Recipe; organizers clear/reassign the slot or delete the plan first. This
  feature owns the plan-side rule; Recipe delete must honor the same block when
  plan slots exist.
