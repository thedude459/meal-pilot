# Feature Specification: Generate Weekly Meals

**Feature Branch**: `008-generate-weekly-meals`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "GenerateWeeklyMeals"

## Clarifications

### Session 2026-07-12

- Q: Is AI recipe creation in this feature’s v1 delivery scope? → A: Library-only in v1; if coverage is incomplete, leave days empty and explain (AI recipe creation deferred)
- Q: How does reject trigger an alternative suggestion? → A: Reject automatically triggers alternative suggestion; on success the day becomes the new Recipe in pending
- Q: How do free-text dislikes block Recipes? → A: Match against Recipe title and ingredient names (case-insensitive exact phrase/token)
- Q: Where do time constraints come from in v1? → A: Soft-rank using Recipe timing/difficulty metadata only; no household time budget in v1
- Q: Which days does a generate request target? → A: Always all eligible days for the chosen mode (no day-subset parameter in v1)
- Post-analyze remediation (2026-07-12): Constitution Hybrid Recipe Sourcing (AI) is **deferred, not waived**—v1 remains library-only; `RecipeHybridEngine` AI creation is a mandatory follow-on. `GENERATION_NO_PREFERENCES` applies only when the household has zero FamilyMembers (empty PreferenceProfile on an existing member is evaluable). Canonical generation modes are `fill-empty` and `regenerate-non-approved`. Soft balance uses cuisine variety + prep/cook timing as difficulty proxy (no separate Recipe difficulty or nutrition fields in v1). Dietary hard filter: every member hard restriction ID MUST appear in Recipe `dietaryAttributeIds`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate a preference-aware weekly plan (Priority: P1)

A household organizer asks the system to generate meals for a Monday-start week.
The system evaluates family preference profiles, filters and ranks candidate
Recipes (including soft ranking by Recipe prep/cook timing when present, used as
the preparation-difficulty proxy), applies variety/rotation and cuisine-diversity
constraints, and writes a WeeklyPlan with day slots filled so the household has
a ready draft to review and approve before grocery generation.

**Why this priority**: GenerateWeeklyMeals is the constitution’s core planning
workflow. Without automatic, preference-honoring plan production, organizers
must hand-build every week and the product’s primary value is missing.

**Independent Test**: With at least two family members who have preference
profiles (including at least one dietary restriction or dislike) and a library
of Recipes that both violate and satisfy those constraints, generate a plan for
a week with no existing WeeklyPlan; confirm a plan exists for that Monday
week-start, filled days reference only constraint-safe Recipes, and each filled
slot is pending for approval.

**Acceptance Scenarios**:

1. **Given** a household with FamilyMembers, PreferenceProfiles, and enough
   constraint-safe Recipes, and no WeeklyPlan for a chosen Monday week-start,
   **When** the organizer runs GenerateWeeklyMeals for that week, **Then** a
   WeeklyPlan is created for that week-start with day slots filled from
   preference-safe candidates; each filled slot starts in pending status.
2. **Given** at least one member has a dietary restriction or dislike that some
   Recipes violate, **When** generation runs, **Then** no filled slot uses a
   Recipe that violates any member’s hard dietary restrictions or recorded
   dislikes (dislikes match case-insensitively as exact phrase/token against
   Recipe title and ingredient names).
3. **Given** generation completes successfully, **When** the organizer opens the
   WeeklyPlan, **Then** they see up to seven day slots (Monday–Sunday), linked
   Recipe titles for filled days, empty days only when no safe candidate
   remained, and pending status on every filled slot.
4. **Given** the organizer omits the week-start or provides a non-Monday
   week-start, **When** they request generation, **Then** the system rejects the
   request and explains what is required; no plan is created or changed.
5. **Given** the household already has a WeeklyPlan for that week-start with
   some empty slots, **When** the organizer runs default generation for that
   week, **Then** all empty slots may be filled and existing filled slots
   (pending, approved, or rejected) are left unchanged; the organizer cannot
   limit the run to a subset of weekdays in v1.

---

### User Story 2 - Review, approve, reject, and get alternatives (Priority: P1)

After generation, the organizer reviews suggested meals on the WeeklyPlan,
approves meals the household will cook, rejects ones they do not want, and
receives an alternative suggestion for each rejected day so planning can
continue without starting over.

**Why this priority**: Constitution meal-planning rules require approve/reject/
modify of suggestions and mandate alternatives after rejection. Approval is also
the gate before BuildGroceryList. Equally critical to generation itself for a
usable weekly loop.

**Independent Test**: On a generated plan with several pending slots, approve
one, reject another, and confirm the rejected day is replaced with a different
preference-safe Recipe in pending status (or a clear explanation if no
alternative exists); approved slot remains unchanged.

**Acceptance Scenarios**:

1. **Given** a generated WeeklyPlan with pending slots, **When** the organizer
   marks a filled slot approved (using the WeeklyPlan per-slot status action),
   **Then** that slot remains the same Recipe with approved status and is not
   changed by later default generation fills.
2. **Given** a filled pending or approved slot, **When** the organizer rejects
   it, **Then** the system automatically attempts an alternative in the same
   reject flow (no separate “suggest alternative” step): if a preference-safe
   different Recipe is available, the day is updated to that Recipe in pending
   status; the organizer does not need a second action to apply the alternative.
3. **Given** a rejected slot and no remaining preference-safe alternative that
   also respects variety/rotation rules for that week, **When** the automatic
   alternative step runs, **Then** the slot stays rejected with the prior Recipe
   (or becomes empty only if the organizer clears it) and the organizer is told
   no alternative could be offered.
4. **Given** an alternative was applied after reject, **When** the organizer
   opens the plan, **Then** that day shows the new Recipe in pending status and
   other days are unchanged.
5. **Given** the organizer wants a different meal without rejecting first,
   **When** they replace the day’s Recipe via the existing WeeklyPlan per-slot
   assign/replace action, **Then** the slot shows the chosen Recipe in pending
   status (manual modify remains available alongside generation).

---

### User Story 3 - Regenerate empty or non-approved days (Priority: P2)

The organizer asks the system to regenerate meals for empty days, or to refresh
pending and rejected days for a week (`regenerate-non-approved`), without
disturbing meals already approved.

**Why this priority**: Households iterate on drafts; regenerating without wiping
approved decisions keeps trust. Secondary to first-time generation and the
approve/reject/alternative loop.

**Independent Test**: On a plan with a mix of empty, pending, approved, and
rejected slots, run regenerate-non-approved; confirm approved slots unchanged,
empty/pending/rejected days updated with new preference-safe pending
assignments where candidates exist.

**Acceptance Scenarios**:

1. **Given** a WeeklyPlan with approved and empty slots, **When** the organizer
   runs regenerate for non-approved days, **Then** approved slots are unchanged
   and empty (and optionally pending/rejected) slots are filled or refreshed
   with new preference-safe pending assignments.
2. **Given** the organizer runs default generation again on a week that already
   has filled pending slots, **When** they did not choose regenerate-non-approved,
   **Then** only empty slots are filled; pending, approved, and rejected slots
   stay as they were.
3. **Given** regenerate would have no eligible candidates for a day, **When**
   it completes, **Then** that day remains empty or prior non-approved content
   as applicable, and the organizer can see which days could not be filled.

---

### User Story 4 - Incomplete library coverage (Priority: P3)

When the household Recipe library cannot safely fill every target day after
preference and constraint filtering, generation still completes with whatever
safe library Recipes it could assign, leaves remaining days empty, and explains
the gap so the organizer can add Recipes or fill days manually.

**Why this priority**: Honest partial plans preserve trust when the catalog is
thin; full hybrid AI recipe creation is deferred and remains a constitution
follow-on.

**Independent Test**: With a library too small to fill seven preference-safe
days, run generation and confirm filled days use only existing household
Recipes, remaining target days stay empty, no new AI-sourced Recipe is created,
and the organizer is told which days could not be filled.

**Acceptance Scenarios**:

1. **Given** preference-safe library Recipes are insufficient to fill all empty
   target days, **When** generation runs, **Then** days that can be filled from
   the safe library are filled as pending, remaining target days stay empty, and
   the organizer is informed that coverage was incomplete.
2. **Given** the household has zero preference-safe Recipes for the requested
   targets, **When** generation runs, **Then** no slots are filled from
   generation, the WeeklyPlan for the week still exists or is created as needed,
   and the organizer receives a clear no-candidates explanation.
3. **Given** generation cannot cover every day, **When** it finishes, **Then**
   the system MUST NOT create AI-generated Recipes or otherwise invent meals
   outside the existing household Recipe library in this feature’s v1.

---

### Edge Cases

- Generation for a non-Monday week-start is rejected; no partial writes.
- Past, current, and future Monday week-starts are all allowed (aligned with
  WeeklyPlan).
- If a WeeklyPlan already exists for the week, default generation fills empty
  slots only; it does not create a second plan for the same week-start.
- Approved slots are never overwritten by default generation, reject
  alternatives, or regenerate-non-approved.
- Hard preference exclusions (dietary restrictions and dislikes across all
  household members) always block candidates; likes influence ranking only.
  Free-text dislikes block a Recipe when a dislike label matches the Recipe
  title or any ingredient name as a case-insensitive exact phrase/token.
  Dietary restrictions continue to use catalog IDs against Recipe dietary
  attribute tags.
- Rotation/variety rules reduce repeat of the same Recipe within the generated
  week and recent prior weeks when history exists; if enforcing rotation would
  leave a day empty, the system MAY relax soft variety before violating hard
  dietary/dislike rules (hard rules never relax).
- Time awareness in v1 uses each Recipe’s existing prep/cook timing minutes as
  a soft ranking signal and as the preparation-difficulty proxy (there is no
  separate Recipe difficulty field). Missing timing does not block a candidate.
  There is no household max-prep-time budget or hard time filter in this
  feature’s v1. Nutrition scoring is out of scope for v1 (no nutrition metadata
  on Recipe); cuisine-tag variety is the diversity soft signal.
- Budget constraints are out of scope for this feature (future extension).
- Pantry data may boost ranking for Recipes that use on-hand items but MUST NOT
  hard-block a meal solely because an ingredient is missing from the pantry
  (grocery generation handles shopping gaps later).
- Reject with a successful alternative: the day ends as the new Recipe in
  pending (rejected is not left as the durable end state when an alternative is
  applied).
- Reject with no alternative: slot remains rejected with the prior Recipe;
  organizer may clear, manually assign, or regenerate later.
- Concurrent generate and manual slot edits: last successful write to a given
  slot wins for that day; generation MUST NOT rewrite unrelated days.
- Household with zero FamilyMembers: generation is rejected with
  `GENERATION_NO_PREFERENCES` until at least one member exists. An existing
  member with an empty PreferenceProfile (no likes, dislikes, or restrictions)
  is still evaluable and MUST NOT alone cause that rejection.
- Household with zero Recipes or zero preference-safe Recipes: generation creates
  or opens the week’s plan but leaves target slots empty and explains that no
  candidates were available.
- This feature does not create AI-generated Recipes; constitution Hybrid Recipe
  Sourcing (AI via `RecipeHybridEngine`) is deferred, not waived—a mandatory
  follow-on must still share the curated schema and pass dietary validation.
- This feature does not build grocery lists, update pantry quantities, or change
  WeeklyPlan week-start identity; BuildGroceryList and UpdatePantry remain
  separate workflows.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a GenerateWeeklyMeals action that accepts a
  household-scoped Monday week-start date and a generation mode (`fill-empty`
  default, or `regenerate-non-approved`), and produces or updates a WeeklyPlan
  for that week by writing MealSlots (at most one meal per day, Monday–Sunday)
  that reference household Recipes in pending approval status. The action MUST
  target all eligible days for the chosen mode; v1 MUST NOT accept a day-subset
  parameter.
- **FR-002**: System MUST create a WeeklyPlan for the week-start when none
  exists, and MUST reuse the existing WeeklyPlan when one already exists for
  that household and week-start (never create a duplicate week plan).
- **FR-003**: System MUST evaluate all household FamilyMembers’
  PreferenceProfiles as generation input: dietary restrictions and dislikes are
  hard exclusions; likes are soft ranking signals. Dietary restrictions MUST
  exclude a Recipe unless every hard restriction ID from the household union
  appears in that Recipe’s `dietaryAttributeIds` (catalog ID equality). Free-text
  dislikes MUST exclude a Recipe when a dislike label matches the Recipe title
  or any of that Recipe’s ingredient names using case-insensitive exact
  phrase/token matching (not fuzzy/NLP matching in v1).
- **FR-004**: System MUST generate candidate meals only from the existing
  household Recipe library (no AI recipe creation in this feature’s v1), then
  filter out any Recipe that violates any member’s hard dietary restrictions or
  dislikes, then rank remaining candidates using soft signals (likes alignment,
  variety/rotation, cuisine-tag diversity when tags exist, Recipe prep/cook
  timing minutes when present as the preparation-difficulty proxy, and pantry
  utilization when pantry data exists). System MUST NOT apply a household
  max-prep-time hard filter in v1 and MUST NOT score nutrition (no nutrition
  metadata on Recipe in v1).
- **FR-005**: Default `fill-empty` generation MUST fill all empty slots for the
  week and MUST NOT change pending, approved, or rejected slots. Explicit
  `regenerate-non-approved` mode MUST refresh all empty, pending, and rejected
  slots while leaving approved slots unchanged. Neither mode accepts a
  weekday-subset filter in v1; per-day control remains via reject→alternative
  and manual WeeklyPlan slot actions.
- **FR-006**: System MUST reject generation requests with missing week-start,
  non-Monday week-start, or zero household FamilyMembers
  (`GENERATION_NO_PREFERENCES`), without partial plan corruption. An existing
  member with an empty PreferenceProfile remains evaluable and MUST NOT trigger
  that rejection by itself.
- **FR-007**: When a filled slot is rejected, System MUST automatically attempt
  an alternative preference-safe Recipe for that day in the same reject flow (no
  separate organizer request to suggest or apply an alternative). The
  alternative MUST be different from the rejected Recipe and compatible with the
  week’s variety/rotation rules. On success, the slot MUST be updated to the
  alternative in pending status (rejected is not the durable end state). On
  failure, the rejected state MUST remain with the prior Recipe and the
  organizer MUST receive a clear explanation. Returning a list of candidates for
  the organizer to pick is out of scope for v1.
- **FR-008**: System MUST allow organizers to approve, reject, clear, or
  manually replace slots using the existing WeeklyPlan per-slot behaviors;
  generation MUST write into that same WeeklyPlan model (no parallel plan
  store).
- **FR-009**: Filled slots produced by generation MUST use pending status (same
  canonical statuses as WeeklyPlan: pending, approved, rejected). This feature
  MUST NOT introduce a separate “suggested” status in v1.
- **FR-010**: Soft planning rules MUST seek balance of variety (including
  cuisine-tag diversity when tags exist), preparation difficulty via Recipe
  prep/cook timing proxy across the week, and MUST apply rotation to avoid
  repeating the same Recipe too frequently within the week and across recent
  prior household WeeklyPlans when history exists. Nutrition-oriented scoring is
  out of scope for v1 (deferred with nutrition metadata). Soft rules MUST NOT
  override hard preference exclusions.
- **FR-011**: System MAY use pantry inventory as a soft ranking input (prefer
  Recipes that use available items) and MUST NOT omit a preference-safe meal
  solely because ingredients are absent from the pantry.
- **FR-012**: When preference-safe library Recipes are insufficient to fill
  target days, System MUST leave those days empty, MUST NOT create AI-generated
  Recipes in this feature’s v1, and MUST inform the organizer which days remain
  unfilled. Constitution Hybrid Recipe Sourcing via `RecipeHybridEngine` is
  deferred, not waived: a follow-on MUST still share the curated Recipe schema
  and pass dietary validation before AI meals can be slotted.
- **FR-013**: Candidate selection, filtering, ranking (given the same inputs),
  and WeeklyPlan writes MUST be deterministic (no non-deterministic AI path in
  this feature’s v1).
- **FR-014**: System MUST NOT generate grocery lists, merge shopping quantities,
  subtract pantry for shopping, export groceries, or auto-update pantry from
  this workflow; those behaviors belong to BuildGroceryList / UpdatePantry.
- **FR-015**: System MUST NOT treat budget limits as generation constraints in
  v1 (deferred constitution extension).
- **FR-016**: System MUST keep generation household-scoped; one household’s
  preferences, recipes, pantry, and plans MUST NOT influence or become visible
  to another household’s generation.
- **FR-017**: When generation cannot fill every target day, System MUST still
  persist successful slot writes for days it could fill and MUST inform the
  organizer which days remain unfilled and why at a high level (e.g., no safe
  library candidates).

### Key Entities *(include if feature involves data)*

- **WeeklyPlan (dependency / write target)**: Existing household week structure
  from the Weekly Plans feature. GenerateWeeklyMeals creates or updates this
  plan and its MealSlots; it does not own a separate plan entity.
- **MealSlot (within WeeklyPlan)**: Day assignment written by generation as
  pending Recipe links; approval/rejection continues via WeeklyPlan slot
  statuses; reject triggers alternative suggestion in this workflow.
- **Recipe (dependency)**: Candidate meal definitions from the existing
  household library only in this feature’s v1. Supplies title and dietary
  attribute tags for validation and display. AI-sourced Recipe creation is out
  of delivery scope here.
- **PreferenceProfile / FamilyMember (dependencies)**: Inputs for hard
  exclusions and soft ranking during Evaluate preferences and Filter constraints.
- **PantryItem (dependency, soft input)**: Optional ranking signal for pantry
  utilization; not a hard filter for meal inclusion.
- **MealSuggestionEngine (workflow service)**: Constitution service that
  performs preference evaluation, library candidate generation/ranking,
  constraint filtering, alternative suggestion after reject, and orchestration
  of writes into WeeklyPlan. AI recipe creation is not part of this feature’s
  v1 engine path.

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences, dietary restrictions, and dislikes MUST be honored (hard
  exclusions for restrictions and dislikes).
- Weekly meal plans MUST balance variety, preparation difficulty (timing proxy),
  and rotation; nutrition scoring is deferred (not waived) until nutrition
  metadata exists.
- Grocery lists MUST derive from approved meals and subtract pantry inventory;
  this feature only produces/updates WeeklyPlan drafts and approvals—it does not
  build grocery lists (BuildGroceryList deferred, not waived).
- AI-generated recipes MUST share the curated schema and pass dietary validation
  before inclusion in a plan; this feature’s v1 does not create AI Recipes
  (Hybrid Recipe Sourcing deferred, not waived).
- Behavior MUST remain deterministic (library-only path).
- Business logic for GenerateWeeklyMeals / MealSuggestionEngine MUST live in
  Speckit specs/workflows only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Organizers can generate a weekly plan for a valid Monday week-start
  in under 2 minutes of their own interaction time (request generation and open
  the resulting plan) when the household already has members, preferences, and
  a usable recipe library.
- **SC-002**: In test households with known hard restrictions and dislikes, 100%
  of generated filled slots comply with all members’ dietary restrictions and
  dislike matches (title and ingredient names, case-insensitive exact
  phrase/token).
- **SC-003**: Default `fill-empty` generation never changes an already-filled
  slot: 100% of approved, pending, and rejected slots remain unchanged when only
  empty-slot fill runs.
- **SC-004**: After a reject that has at least one valid alternative, 100% of
  such rejects result in a different preference-safe Recipe on that day in
  pending status without changing other days.
- **SC-005**: Regenerate-non-approved leaves 100% of approved slots intact while
  updating at least one eligible empty or non-approved slot when safe candidates
  exist.
- **SC-006**: At least 90% of organizers in usability checks can complete
  generate → review → approve at least four days without assistance on the first
  attempt.
- **SC-007**: When the library cannot cover the week, generation still completes
  without corrupting the plan, creates no AI Recipes, and clearly reports
  unfilled days on 100% of such runs.
- **SC-008**: Duplicate WeeklyPlans for the same week-start are prevented 100%
  of the time when generation runs against an existing week (reuse, don’t
  duplicate).

## Assumptions

- Target user is the household organizer (same actor model as prior Meal Pilot
  features).
- GenerateWeeklyMeals is the constitution workflow with steps: Evaluate
  preferences → Generate candidate meals → Filter based on constraints →
  Produce final weekly plan; MealSuggestionEngine implements that behavior.
- WeeklyPlan (feature 007) already provides durable week identity, seven day
  slots, per-slot assign/clear/status, and pending/approved/rejected statuses;
  this feature writes into that model rather than replacing it.
- Default generation mode is `fill-empty` (empty slots only);
  `regenerate-non-approved` is an explicit second mode for refreshing drafts
  without touching approved meals. Both modes always target all eligible days
  for that mode; no day-subset parameter in v1.
- Engine-produced meals use pending status (no separate “suggested” status in
  v1).
- Reject → alternative is in scope here and is automatic in the same reject
  flow: success replaces the day with a new pending Recipe; failure leaves
  rejected. Organizer-picked candidate lists are out of scope for v1.
  (WeeklyPlan alone previously recorded reject without alternatives.)
- Hard exclusions apply across all household members (union of restrictions and
  dislikes). Likes are soft preferences only. Dislike matching is
  case-insensitive exact phrase/token against Recipe title and ingredient names
  (no fuzzy matching in v1).
- Pantry is an input for ranking, not a hard gate for meal selection.
- Budget-aware planning is deferred.
- Time constraints are soft ranking inputs from Recipe prep/cook minutes only
  (difficulty proxy; no separate difficulty field); there is no household time
  budget in v1. Missing Recipe timing does not block generation. Nutrition
  scoring is deferred until Recipe nutrition metadata exists.
- Rotation looks at the current week and recent prior WeeklyPlans for the same
  household when present; exact “too frequently” window defaults to the current
  week plus the previous 2 weeks unless planning refinement says otherwise.
- This feature’s v1 is library-only: candidates come from existing household
  Recipes; incomplete coverage leaves days empty with an explanation. Hybrid AI
  recipe creation (`RecipeHybridEngine`) is deferred, not waived—a mandatory
  constitution follow-on.
- Zero FamilyMembers → `GENERATION_NO_PREFERENCES`; empty PreferenceProfile on
  an existing member remains evaluable.
- BuildGroceryList, grocery export, and UpdatePantry remain out of delivery
  scope for this feature.
- Manual WeeklyPlan create/edit/approve remains available; generation is an
  additive workflow, not the only way to fill a week.
- Multi-meal-types-per-day (breakfast/lunch/dinner) remain out of scope; v1
  continues one slot per calendar day.
- SC-001 and SC-006 are manual UX outcomes, not solely automated harness gates.
