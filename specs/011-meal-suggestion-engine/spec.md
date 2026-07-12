# Feature Specification: Meal Suggestion Engine

**Feature Branch**: `011-meal-suggestion-engine`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "MealSuggestionEngine"

## Clarifications

### Session 2026-07-12

- Q: How should this feature relate to GenerateWeeklyMeals (008)? → A: Formalize/lock existing 008 engine behavior as this service’s Speckit contract (no intentional ranking/filter behavior changes)
- Q: How is MealSuggestionEngine exposed to organizers? → A: Internal service only — consumed by GenerateWeeklyMeals / reject→alternative; no new standalone suggest surface
- Q: What does “done” mean for this feature’s delivery? → A: Spec + bounded service ownership — align/extract domain+service boundaries and dedicated tests under this feature; no intentional behavior change

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preference-safe meal candidates for the week (Priority: P1)

A household organizer asks the planning workflow to fill a week. Behind that
workflow, the Meal Suggestion Engine (an internal service—not a separate
organizer-facing suggest surface) evaluates every family member’s preference
profile, builds a pool of candidate Recipes from the household library,
hard-filters out meals that violate dietary restrictions or recorded dislikes,
soft-ranks the rest (variety, rotation, prep/cook timing, pantry utilization),
and returns ordered suggestions so the week can be drafted without preference
violations.

**Why this priority**: MealSuggestionEngine is the constitution service behind
GenerateWeeklyMeals. Without reliable preference evaluation and candidate
ranking, weekly plans cannot be trusted and the product’s core planning value
fails.

**Independent Test**: With FamilyMembers whose PreferenceProfiles include at
least one hard dietary restriction and one dislike, plus a Recipe library that
both violates and satisfies those constraints, request suggestions for a
Monday-start week context; confirm every returned candidate is preference-safe
and none of the violating Recipes appear in the ranked results.

**Acceptance Scenarios**:

1. **Given** a household with FamilyMembers, PreferenceProfiles, and a Recipe
   library containing both safe and unsafe meals, **When** the engine produces
   candidates for a week context, **Then** every returned candidate Recipe
   satisfies all members’ hard dietary restrictions and recorded dislikes.
2. **Given** a member hard dietary restriction ID, **When** candidates are
   filtered, **Then** a Recipe is eligible only when every household member’s
   hard restriction ID appears in that Recipe’s dietary attribute tags.
3. **Given** a recorded dislike phrase, **When** candidates are filtered,
   **Then** Recipes whose title or ingredient names match that dislike
   (case-insensitive exact phrase/token) are excluded.
4. **Given** enough preference-safe Recipes, **When** the engine ranks
   candidates for multiple empty days in the same week, **Then** soft ranking
   uses likes alignment, cuisine-tag variety when tags exist, Recipe prep/cook
   timing minutes when present as a preparation-difficulty proxy, pantry
   utilization when stock exists, and rotation against the target week plus the
   previous two weeks when history exists (same rules as GenerateWeeklyMeals
   008; no intentional ranking changes).
5. **Given** pantry inventory for the household, **When** ranking runs,
   **Then** the engine boosts Recipes that better utilize available
   (non-expired) pantry stock as a soft signal, but MUST NOT hard-block a
   Recipe solely because ingredients are missing from the pantry.

---

### User Story 2 - Alternative after a rejected meal (Priority: P1)

After a suggested meal is rejected on a day slot, the organizer needs a
different preference-safe alternative for that day so planning continues
without regenerating the whole week. The engine proposes the next best
candidate that differs from the rejected Recipe and still respects hard
constraints and the week’s variety/rotation soft rules.

**Why this priority**: Constitution meal-planning rules require alternative
suggestions after rejection. Without engine-backed alternatives, reject dead-
ends the day and organizers abandon the draft.

**Independent Test**: With a week context that already has several assigned
Recipes and at least two remaining preference-safe alternatives for a target
day, request an alternative excluding the rejected Recipe; confirm a different
safe Recipe is returned (or a clear empty result when none remain).

**Acceptance Scenarios**:

1. **Given** a week context with an assigned Recipe on a day and at least one
   other preference-safe Recipe that respects variety/rotation for that week,
   **When** the engine is asked for an alternative excluding the current
   Recipe, **Then** it returns a different preference-safe Recipe suitable for
   that day.
2. **Given** no remaining preference-safe alternative that also respects soft
   rotation for that week, **When** an alternative is requested, **Then** the
   engine soft-relaxes rotation only (retry without rotation exclusions) before
   leaving the day without a suggestion, and MUST NEVER violate hard dietary
   restrictions or dislikes to fill the day.
3. **Given** no preference-safe Recipe remains even after soft-rule relaxation,
   **When** an alternative is requested, **Then** the engine returns no
   suggestion and a clear high-level reason (e.g., no safe library candidates),
   without inventing or fetching meals outside the household Recipe library.

---

### User Story 3 - Deterministic, household-scoped suggestions (Priority: P2)

Organizers (and automated tests) can rely on the same household inputs producing
the same ranked suggestions. Suggestions for one household never leak preferences,
recipes, pantry, or plan history from another household.

**Why this priority**: Determinism keeps planning predictable and reviewable;
household isolation is required for trust. Secondary to producing useful safe
suggestions, but mandatory for correctness.

**Independent Test**: Run the engine twice with identical household inputs and
confirm identical ordered candidate results; run with a second household’s data
and confirm no cross-visibility of the first household’s recipes or preferences.

**Acceptance Scenarios**:

1. **Given** identical household members, preferences, recipes, pantry snapshot,
   and week/plan history, **When** the engine ranks candidates twice, **Then**
   the ordered results are identical (deterministic library-only path).
2. **Given** two households, **When** suggestions are produced for household A,
   **Then** household B’s preferences, recipes, pantry, and plans neither
   influence nor appear in A’s results.
3. **Given** a household with zero FamilyMembers, **When** suggestion is
   requested, **Then** the engine refuses to produce preference-based
   candidates and explains that preferences are unavailable (empty preference
   profiles on existing members remain evaluable).

---

### Edge Cases

- What happens when the safe candidate pool is smaller than the number of empty
  days? Rotation soft-relax may apply; hard constraints never relax; remaining
  days stay without a suggestion and reasons are reportable to the workflow.
- How does the engine handle Recipes missing prep/cook timing? Timing is skipped
  as a soft signal; missing timing does not block eligibility.
- How does the engine handle Recipes without cuisine tags? Cuisine diversity is
  skipped for those Recipes; other soft signals still apply.
- What if enforcing rotation would empty the pool for a day? Soft-relax
  rotation only (drop rotation exclusions for that day) before returning no
  suggestion; hard filters stay.
- What if the dislike text is empty or whitespace-only? It does not exclude any
  Recipe.
- What if pantry data is absent or empty? Ranking proceeds without pantry
  utilization boosts.
- What if the only remaining candidates repeat a Recipe already used earlier in
  the same week? Soft rotation prefers avoiding repeats; after rotation
  soft-relax, a repeat MAY be suggested rather than leaving the day empty.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a MealSuggestionEngine service that, given a
  household week context, evaluates FamilyMember PreferenceProfiles and returns
  ranked preference-safe Recipe candidates from the household Recipe library.
  The service is internal: organizers reach it only through GenerateWeeklyMeals
  and reject→alternative flows—no standalone “suggest only” surface in this
  feature. Bounded module ownership and dedicated tests for this service are
  specified in FR-017.
- **FR-002**: System MUST hard-exclude any Recipe that fails any member’s hard
  dietary restriction: every member hard restriction ID MUST appear in the
  Recipe’s dietary attribute tags for the Recipe to remain eligible.
- **FR-003**: System MUST hard-exclude any Recipe whose title or ingredient
  names match any member’s recorded dislike using case-insensitive exact
  phrase/token matching (not fuzzy matching).
- **FR-004**: System MUST soft-rank eligible candidates using the locked 008
  signals: likes alignment, cuisine-tag variety when tags exist, Recipe
  prep/cook timing minutes when present as the preparation-difficulty proxy,
  non-expired pantry utilization when stock exists (per FR-005), and rotation
  against the target week plus the previous two Monday week-starts when history
  exists. Tie-break MUST be deterministic (stable Recipe identity ascending).
- **FR-005**: System MUST use non-expired pantry inventory as a soft ranking
  boost when stock exists (prefer Recipes that use available stock) and MUST
  NOT hard-block a Recipe solely because ingredients are absent from the
  pantry.
- **FR-006**: System MUST support alternative suggestion for a single day:
  exclude one or more already-considered Recipe IDs and return the next best
  preference-safe candidate under the same hard and soft rules.
- **FR-007**: When rotation exclusions would leave a day without candidates,
  System MUST soft-relax by retrying without rotation exclusions before
  returning empty; System MUST NEVER relax hard dietary restrictions or dislike
  exclusions. Other soft signals (likes, cuisine, timing, pantry) are ranking
  weights, not separately relaxed exclusion layers.
- **FR-008**: When no preference-safe candidate remains, System MUST return an
  empty suggestion result with a high-level reason suitable for organizer
  messaging (e.g., no safe library candidates).
- **FR-009**: Candidate selection, filtering, and ranking for identical inputs
  MUST be deterministic (library-only path; no non-deterministic AI creation in
  this feature).
- **FR-010**: System MUST keep all evaluation household-scoped; one household’s
  data MUST NOT influence or become visible to another household’s suggestions.
- **FR-011**: System MUST refuse preference-based suggestion when the household
  has zero FamilyMembers; empty PreferenceProfiles on existing members remain
  evaluable.
- **FR-012**: System MUST NOT create AI Recipes, invent meals outside the
  household library, build grocery lists, update pantry stock, own WeeklyPlan
  persistence rules, or expose a new organizer-facing standalone suggest
  surface in this feature; those belong to RecipeHybridEngine / BuildGroceryList
  / UpdatePantry / WeeklyPlan & GenerateWeeklyMeals orchestration (or remain
  out of scope).
- **FR-013**: System MUST NOT treat budget limits or nutrition scores as ranking
  or filter inputs in this feature (deferred until those constraints/metadata
  exist).
- **FR-014**: System MUST NOT apply a household max-prep-time hard filter;
  timing is soft-rank only when Recipe timing metadata exists.
- **FR-015**: GenerateWeeklyMeals (and related reject→alternative flows) MUST be
  able to consume engine outputs to fill or replace day suggestions without
  re-implementing preference filtering or ranking rules outside this service.
- **FR-016**: MealSuggestionEngine behavior in this feature MUST match the
  locked GenerateWeeklyMeals (008) library-only engine rules (hard filters,
  soft scores, rotation window, rotation soft-relax, determinism). This feature
  MUST NOT introduce intentional ranking or filter behavior changes versus that
  contract.
- **FR-017**: Delivery MUST establish bounded MealSuggestionEngine ownership:
  domain suggestion logic and the service facade are clearly attributable to
  this Speckit feature, with dedicated tests covering hard filters, soft
  ranking, rotation soft-relax, alternatives, determinism, and household
  isolation. Structural align/extract work is in scope; intentional behavior
  change and full re-implementation are out of scope.

### Key Entities *(include if feature involves data)*

- **MealSuggestionEngine (service)**: Constitution service that evaluates
  preferences, builds and filters library candidates, soft-ranks them, and
  proposes alternatives. Internal only—does not persist WeeklyPlan rows and
  does not expose a standalone organizer suggest surface; consumers
  (GenerateWeeklyMeals / WeeklyPlan reject flows) apply results.
  **Implementation alias**: MealSuggestionEngine ≡ pure domain module
  `src/domain/meal-suggestion.ts` + facade `MealSuggestionService` in
  `src/services/meal-suggestion-service.ts`.
- **SuggestionContext (logical input)**: Household identity, target Monday week-
  start, existing day assignments for the week, optional exclusions (e.g.,
  rejected Recipe IDs), and snapshots of preferences, recipes, pantry, and
  recent plan history needed for ranking. Logical only—no separate durable
  type or table is required; may be represented by existing function parameters
  / local snapshots in the service facade.
- **SuggestionResult (logical output)**: Ordered preference-safe Recipe
  candidates and/or a single next alternative, plus high-level unfilled reasons
  when the pool is exhausted. Logical only—mapped to existing
  `GenerationReport` / `AlternativeOutcome` (and WeeklyPlan writes by
  consumers); no separate persisted entity.
- **Recipe (dependency)**: Household library meal definitions supplying title,
  ingredients, dietary attribute tags, optional cuisine tags, and optional
  prep/cook timing.
- **PreferenceProfile / FamilyMember (dependencies)**: Hard restrictions,
  dislikes, and likes used for exclusion and soft preference signals.
- **PantryItem (dependency, soft input)**: Soft ranking input when non-expired
  stock exists (required soft boost per FR-005); never a sole hard exclusion
  for meal eligibility. Absent/empty pantry simply yields no pantry boost.
- **WeeklyPlan / MealSlot (consumer write targets)**: Owned by Weekly Plans /
  GenerateWeeklyMeals; the engine reads week context and exclusions but does not
  define plan CRUD or slot status transitions.

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences, dietary restrictions, and dislikes MUST be honored (hard
  exclusions for restrictions and dislikes).
- Weekly meal plans MUST balance variety, preparation difficulty (timing proxy),
  and rotation; nutrition scoring is deferred (not waived) until nutrition
  metadata exists.
- Grocery lists MUST derive from approved meals and subtract pantry inventory;
  this feature only suggests meals—it does not build grocery lists.
- AI-generated recipes MUST share the curated schema and pass dietary validation
  before inclusion in a plan; this feature does not create AI Recipes
  (RecipeHybridEngine deferred, not waived).
- Non-AI behavior MUST remain deterministic (library-only suggestion path).
- Business logic for MealSuggestionEngine MUST live in Speckit specs/workflows
  only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In test households with known hard restrictions and dislikes, 100%
  of engine-returned candidates comply with all members’ dietary restrictions
  and dislike matches (title and ingredient names, case-insensitive exact
  phrase/token).
- **SC-002**: Given identical household inputs, repeated ranking runs produce
  identical ordered candidate lists 100% of the time (deterministic path).
- **SC-003**: When at least one valid alternative exists for a reject context,
  the engine returns a different preference-safe Recipe 100% of the time.
- **SC-004**: Rotation soft-relax never causes a hard-constraint violation: 0%
  of returned candidates in compliance tests violate dietary restrictions or
  dislikes, including after rotation soft-relax.
- **SC-005**: Cross-household isolation holds in 100% of isolation checks:
  household A suggestions never include or depend on household B library or
  preference data.
- **SC-006**: When the safe library cannot cover requested days, the engine
  returns empty results with an explainable reason on 100% of exhausted-pool
  runs and never invents out-of-library meals.
- **SC-007**: GenerateWeeklyMeals-style fill of a week that already has members,
  preferences, and a usable library can obtain engine candidates for eligible
  days in under 2 minutes of organizer interaction time when wired through the
  existing planning workflow.
- **SC-008**: Dedicated MealSuggestionEngine tests cover hard-filter compliance,
  soft-ranking determinism, rotation soft-relax, alternative exclusion, and
  household isolation with 100% of those cases attributable to this feature’s
  bounded service ownership (no intentional behavior drift vs 008).

## Assumptions

- Target user is the household organizer (same actor model as prior Meal Pilot
  features).
- MealSuggestionEngine is the constitution service named in Architectural
  Rules; GenerateWeeklyMeals is the primary workflow consumer that persists
  WeeklyPlan / MealSlot updates using engine outputs (including reject→
  alternative). Organizers do not call the engine directly in this feature.
- Feature 008 already established library-only generation modes, dislike
  matching rules, dietary hard-filter semantics, soft likes/timing/cuisine/
  pantry/rotation ranking, rotation window (target week + previous two weeks),
  rotation soft-relax, and deterministic behavior; this feature is the
  dedicated service Speckit contract that locks that engine behavior—not a
  second competing planner and not a vehicle for intentional ranking changes.
- Delivery is bounded service ownership (domain + service facade + dedicated
  tests), not docs-only verification and not a from-scratch re-implementation.
- Candidates come only from the existing household Recipe library. AI recipe
  creation remains a mandatory follow-on via RecipeHybridEngine (deferred, not
  waived).
- Dislike matching is case-insensitive exact phrase/token against Recipe title
  and ingredient names (no fuzzy/NLP matching).
- Time awareness uses Recipe prep/cook timing metadata only; no household time
  budget hard filter.
- Nutrition scoring and budget-aware filtering are deferred.
- Pantry utilization is a required soft boost when non-expired stock exists.
- Multi-meal-types-per-day (breakfast/lunch/dinner) remain out of scope; one
  meal suggestion per day context.
- Likes MUST influence soft ranking when present but never override hard
  restrictions or dislikes.
- WeeklyPlan identity, slot statuses (pending/approved/rejected), and generate
  modes (`fill-empty`, `regenerate-non-approved`) remain owned by Weekly Plans /
  GenerateWeeklyMeals; this feature owns suggestion evaluation rules and
  candidate/alternative selection.
