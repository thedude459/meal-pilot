# Feature Specification: Recipe Hybrid Engine

**Feature Branch**: `012-recipe-hybrid-engine`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "RecipeHybridEngine"

## Clarifications

### Session 2026-07-12

- Q: When weekly planning has a preference-safe library shortfall, who invokes RecipeHybridEngine in this feature’s delivery? → A: Internal service only — planning workflows may call it later; this feature does not change GenerateWeeklyMeals orchestration
- Q: Should organizers get a direct generate/substitute recipe surface in this feature? → A: Internal service only — no new organizer-facing generate/substitute surface
- Q: When an AI candidate fails preference or schema validation, how many regeneration attempts may the engine make before reporting failure/shortfall? → A: Up to 3 attempts per requested recipe, then fail/shortfall
- Q: When a caller requests replace-in-place substitution on a curated recipe, what happens to that recipe’s source? → A: Replace-in-place on curated recipes is not allowed — only distinct AI-sourced variants; replace-in-place only for existing AI recipes
- Q: Is seasonal/budget soft guidance (User Story 4 / P3) in this feature’s delivery, or deferred after P1–P2? → A: Include in this feature as P3 (after generate/fill + substitution)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preference-safe AI recipes that match the shared schema (Priority: P1)

When the household recipe library cannot cover preference-safe meal needs,
callers ask the Recipe Hybrid Engine (an internal service—not a change to
GenerateWeeklyMeals orchestration in this feature) for new AI-generated recipes.
The engine produces recipes that use the same structured shape as curated
recipes (title, measurable ingredients, ordered instructions, optional metadata,
dietary attribute tags), marks them as AI-sourced, and only accepts recipes that
satisfy every family member’s hard dietary restrictions and recorded dislikes.

**Why this priority**: Constitution Hybrid Recipe Sourcing requires curated plus
AI meals under one schema with dietary validation before plan inclusion. Without
this path, incomplete library coverage leaves empty plan days with no way to add
safe meals beyond hand-curated entries.

**Independent Test**: With PreferenceProfiles that include at least one hard
dietary restriction and one dislike, request AI recipe generation for the
household; confirm every accepted recipe uses the shared recipe shape, has source
AI, and does not violate hard restrictions or dislikes; confirm a generation that
would violate constraints is rejected and not added to the library.

**Acceptance Scenarios**:

1. **Given** a household with FamilyMembers and PreferenceProfiles that include
   hard dietary restrictions, **When** the engine generates an AI recipe that
   satisfies those restrictions, **Then** the recipe is available in the
   household library with the shared recipe fields filled and source marked as
   AI.
2. **Given** an AI generation result that omits required shared-schema fields
   (title, at least one valid ingredient, at least one instruction step) or uses
   invalid units or unknown dietary attribute IDs, **When** the engine validates
   the result, **Then** the recipe is not saved and the failure is explained
   clearly.
3. **Given** household hard dietary restriction IDs, **When** an AI recipe is
   considered for acceptance, **Then** it is eligible only when every member’s
   hard restriction ID appears in that recipe’s dietary attribute tags (same
   catalog and matching rule used by meal suggestion).
4. **Given** a recorded dislike phrase, **When** an AI recipe is considered for
   acceptance, **Then** recipes whose title or ingredient names match that
   dislike (case-insensitive exact phrase/token) are rejected and not saved.
5. **Given** a successfully accepted AI recipe, **When** meal planning or grocery
   workflows consume it, **Then** they can treat it like any other library recipe
   without needing a special AI-only shape.

---

### User Story 2 - Fill coverage gaps via hybrid fill service (Priority: P1)

When preference-safe curated (and existing library) recipes are insufficient,
a caller (test harness or a later planning workflow) asks the Recipe Hybrid
Engine’s hybrid fill capability to generate additional preference-aware
candidates so empty days can be filled without weakening hard dietary rules.
This feature ships that callable fill capability; it does **not** wire
GenerateWeeklyMeals to auto-invoke it.

**Why this priority**: GenerateWeeklyMeals and MealSuggestionEngine currently
stop at the library and leave gaps when coverage is incomplete. Hybrid sourcing
exists to close those gaps while keeping hard constraints intact; wiring the
weekly-plan orchestrator is a follow-on.

**Independent Test**: With a library that has fewer preference-safe recipes than
a requested fill count, call hybrid fill for the shortfall; confirm new AI
recipes appear in the library, remain preference-safe, and are selectable by the
existing suggestion path without changing hard-filter rules or GenerateWeeklyMeals
orchestration.

**Acceptance Scenarios**:

1. **Given** a hybrid fill request for N additional preference-safe recipes when
   the library cannot already supply them, **When** the engine runs fill, **Then**
   it attempts to produce preference-safe AI recipes up to the requested count
   (subject to library capacity).
2. **Given** successful hybrid fill recipes, **When** MealSuggestionEngine (or
   equivalent library selection) runs afterward, **Then** those AI-sourced
   recipes are eligible candidates under the same hard preference filters as
   curated recipes.
3. **Given** generation cannot produce enough preference-safe recipes after at
   most 3 attempts per requested recipe, **When** hybrid fill completes, **Then**
   the engine reports how many recipes were accepted and that remaining shortfall
   was not filled, without inventing unsafe meals or relaxing hard dietary rules.
4. **Given** the household library is already at its maximum capacity, **When**
   hybrid generation would add another recipe, **Then** the engine refuses the
   add, leaves the library unchanged, and reports that the library is full.

---

### User Story 3 - Ingredient substitution with dietary safety (Priority: P2)

A caller asks the internal Recipe Hybrid Engine to substitute a single named
ingredient on a library recipe—curated or AI—while keeping the shared schema
and preference safety. The caller supplies a structured replacement line
(name, quantity, unit). The engine proposes a substituted recipe variant that
remains measurable and hard-constraint-safe before it is accepted into the
library. No organizer-facing substitute UI is introduced in this feature.
Multi-ingredient substitution in one request is out of scope for v1 (callers
may issue sequential requests).

**Why this priority**: Constitution Recipe Hybrid Engine requires ingredient
substitution support. It is valuable after basic AI create/fill works, and must
not bypass dietary validation.

**Independent Test**: Starting from a preference-safe recipe, request a
substitution for a named ingredient; confirm the accepted variant still matches
the shared schema, reflects the substitution, remains preference-safe, and is
stored as a distinct AI-sourced recipe when the original is curated (replace-
in-place only allowed for existing AI recipes).

**Acceptance Scenarios**:

1. **Given** a household library recipe and a requested single-ingredient
   substitution with a structured replacement (name, quantity, unit), **When**
   the engine produces an accepted substituted variant, **Then** the variant
   uses the shared recipe schema, includes that replacement ingredient line in
   place of the matched original line, and remains preference-safe for the
   household.
2. **Given** a proposed substitution that would violate hard dietary restrictions
   or recorded dislikes, **When** validation runs, **Then** the variant is
   rejected and the original recipe remains unchanged.
3. **Given** a successful substitution on a curated recipe, **When** the request
   completes, **Then** the original curated recipe remains unchanged and the
   variant is stored as a distinct AI-sourced recipe (replace-in-place on curated
   recipes is not allowed).
4. **Given** a successful substitution on an existing AI-sourced recipe with an
   explicit replace-in-place request, **When** validation passes, **Then** that
   AI recipe is updated in place and remains source AI.
5. **Given** a replace-in-place request targeting a curated recipe, **When** the
   engine handles the request, **Then** it rejects replace-in-place and leaves
   the curated recipe unchanged (callers must use distinct-variant mode).

---

### User Story 4 - Seasonal and budget-aware generation filters (Priority: P3)

When requesting AI generation or hybrid fill, the caller may supply seasonal
and/or budget-oriented constraints. The engine uses those as soft guidance for
generation and labeling so results better match household context, without
overriding hard dietary rules.

**Why this priority**: Constitution requires seasonal or budget-based filtering
support. Delivered in this feature as P3 after generate/fill (P1) and
substitution (P2)—not deferred to a later feature.

**Independent Test**: Request generation with a seasonal constraint and with a
budget-oriented constraint in separate runs; confirm accepted recipes are still
preference-safe and shared-schema valid, and that constraint guidance is
reflected in cuisine/style tags or equivalent non-breaking metadata the product
already supports (without inventing a second recipe schema).

**Acceptance Scenarios**:

1. **Given** a generation request that includes a seasonal constraint, **When**
   an AI recipe is accepted, **Then** it remains preference-safe and shared-
   schema valid, and the seasonal guidance is reflected in recipe metadata the
   household can see (for example cuisine/style tags), without dropping required
   fields.
2. **Given** a generation request that includes a budget-oriented constraint,
   **When** an AI recipe is accepted, **Then** it remains preference-safe and
   shared-schema valid; budget guidance MUST NOT cause the engine to accept a
   recipe that fails hard dietary validation.
3. **Given** no seasonal or budget constraints on the request, **When**
   generation runs, **Then** the engine still produces preference-safe shared-
   schema recipes (constraints are optional).

---

### User Story 5 - Clear failure, household isolation, and AI-only non-determinism (Priority: P2)

Callers understand when hybrid generation fails, never see another household’s
recipes or preferences, and can rely on all non-AI validation and persistence
behavior being deterministic even though AI generation itself is
non-deterministic.

**Why this priority**: Trust and constitution constraints require isolation and
explicit non-determinism boundaries; secondary to successful generation but
mandatory for correctness.

**Independent Test**: Trigger validation failures and a cross-household read
attempt; confirm clear failure messaging, no cross-household visibility, and
identical validation outcomes for identical candidate recipe payloads.

**Acceptance Scenarios**:

1. **Given** identical AI candidate payload content and the same household
   preference inputs, **When** dietary/schema validation runs twice, **Then**
   accept/reject outcomes are identical (validation is deterministic).
2. **Given** recipes and preferences belonging to household A, **When**
   household B requests generation, listing, or substitution, **Then**
   household A’s data is never returned or used.
3. **Given** AI generation fails (provider unavailable, unusable output, or
   repeated preference-unsafe results), **When** the request completes, **Then**
   the caller receives a clear high-level reason and no partial invalid recipe
   is left in the library.

---

### Edge Cases

- What happens when the household has zero FamilyMembers or empty
  PreferenceProfiles? Generation still runs against evaluable (possibly empty)
  constraints; empty hard restrictions mean dietary-tag hard-match is vacuously
  satisfied, but shared-schema validation still applies (covered by dedicated
  verification in tasks).
- What happens when AI returns a recipe that is schema-valid but preference-
  unsafe (or schema-invalid)? Reject and do not persist; retry generation up to
  a maximum of 3 attempts per requested recipe, then report failure/shortfall
  for that recipe slot.
- What happens when substitution targets an ingredient name that is not on the
  recipe? Reject with a clear reason; leave the original unchanged.
- What happens when replace-in-place is requested for a curated recipe? Reject
  replace-in-place; leave the curated recipe unchanged; callers may request a
  distinct AI-sourced variant instead. Replace-in-place is allowed only for
  existing AI-sourced recipes.
- What happens when seasonal/budget constraints conflict with hard dietary
  rules? Hard dietary rules win; never accept an unsafe recipe to satisfy soft
  constraints.
- What happens at the 500-recipe library cap? Refuse new AI adds; report
  library full.
- What happens if curated recipe CRUD is requested through this engine? Out of
  scope—curated create/edit/delete remains owned by the Recipe library feature;
  this engine only creates/accepts AI-sourced (and substitution-produced)
  recipes under hybrid rules.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Recipe Hybrid Engine that can generate
  AI-sourced recipes for a household using the same shared Recipe schema as
  curated recipes (title; ordered measurable ingredients with name, positive
  quantity, and catalog unit; ordered instruction steps; optional servings,
  prep/cook timing, cuisine/style tags, and dietary attribute tags; source).
- **FR-002**: Every AI recipe accepted by the engine MUST set source to AI and
  MUST pass the same structural validation rules as curated recipes (required
  fields, unit catalog, dietary catalog IDs, field/length/count limits).
- **FR-003**: System MUST validate every AI recipe against all household
  FamilyMember PreferenceProfiles before library acceptance or plan
  eligibility: hard dietary restriction IDs MUST all appear on the recipe’s
  dietary attribute tags; dislike phrases MUST NOT match recipe title or
  ingredient names (case-insensitive exact phrase/token).
- **FR-004**: System MUST persist accepted AI recipes in the household library
  so existing meal-suggestion and grocery consumers can use them without a
  second schema.
- **FR-005**: System MUST support hybrid fill requests that ask for up to N
  additional preference-safe AI recipes when library coverage is insufficient
  for a planning context, and MUST report accepted count versus unmet shortfall
  without relaxing hard dietary rules. Exposure and GenerateWeeklyMeals non-
  wiring follow **FR-011**. For each requested recipe slot, when a generated
  candidate fails schema or preference validation, System MUST retry generation
  up to a maximum of 3 total attempts for that slot (including the first); after
  3 failures, System MUST leave that slot unfilled, MUST NOT persist invalid
  candidates, and MUST include the unmet slot in the shortfall/failure report.
- **FR-006**: System MUST support single-ingredient substitution requests that
  produce a preference-safe shared-schema variant. Each request MUST name exactly
  one existing ingredient line and MUST include a structured replacement
  (`name`, positive `quantity`, catalog `unitId`); free-text or generator-
  invented replacements without that structure are out of scope for v1. Default
  mode MUST create a distinct AI-sourced library recipe and MUST NOT modify the
  original. Replace-in-place MUST be allowed only when the target recipe’s source
  is already AI; replace-in-place on curated recipes MUST be rejected without
  changing the curated recipe. Unsafe substitutions MUST be rejected without
  changing the original recipe.
- **FR-007**: System MUST support optional seasonal and budget-oriented
  constraints on generation/fill requests as soft guidance that never overrides
  hard dietary validation. This capability is in scope for this feature as
  priority P3 (after generate/fill and substitution), not deferred.
- **FR-008**: System MUST keep all generation, validation, substitution, and
  persistence household-scoped; one household’s recipes and preferences MUST NOT
  leak to another.
- **FR-009**: AI generation itself MAY be non-deterministic; schema validation,
  dietary validation, persistence outcomes for a given candidate payload, and
  all curated (non-AI) paths MUST remain deterministic.
- **FR-010**: System MUST enforce the existing household recipe library capacity
  (maximum 500 recipes); generation that would exceed the cap MUST fail without
  inserting a row.
- **FR-011**: System MUST NOT modify curated recipe create/edit/delete ownership;
  MUST NOT build grocery lists; MUST NOT update pantry stock; MUST NOT own
  WeeklyPlan persistence or MealSuggestionEngine hard/soft ranking rules beyond
  supplying preference-safe AI library recipes those consumers can select; MUST
  NOT change GenerateWeeklyMeals to auto-call hybrid fill in this feature; MUST
  NOT expose a new organizer-facing generate or substitute surface (internal
  service contract only).
- **FR-012**: When generation, validation, substitution, or capacity checks
  fail, System MUST return a clear high-level reason and MUST NOT leave partial
  invalid recipes in the library.
- **FR-013**: System MUST treat AI-sourced library recipes as first-class for
  downstream selection: after acceptance, hard preference filtering applies
  identically to curated and AI sources.

### Key Entities *(include if feature involves data)*

- **Recipe**: Existing household meal definition with shared schema and source
  `curated` | `ai`. This feature creates/accepts `ai` instances (and
  substitution variants) without changing the curated CRUD contract.
- **HybridGenerationRequest**: A household-scoped request for one or more AI
  recipes, optionally including desired count, planning shortfall context, and
  optional seasonal/budget soft constraints.
- **HybridGenerationResult**: Outcome of a generation/fill attempt: accepted
  recipes (if any), counts accepted versus requested, and high-level failure or
  shortfall reasons when applicable.
- **SubstitutionRequest**: A request to replace exactly one ingredient line on
  an existing library Recipe with a structured replacement line, while
  preserving shared schema and preference safety.
- **PreferenceProfile / FamilyMember**: Existing preference inputs used for
  dietary validation (hard restrictions and dislikes); not redefined here.

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences, dietary restrictions, and dislikes MUST be honored; AI recipes
  that fail validation MUST NOT be accepted into the library or treated as plan-
  eligible.
- Grocery lists MUST derive from approved meals and subtract pantry inventory;
  this feature only supplies structured Recipes—it does not build grocery lists.
- AI-generated recipes MUST share the curated schema and pass dietary validation
  before inclusion in a plan.
- Non-AI behavior MUST remain deterministic; AI generation is the only
  explicitly non-deterministic path in this feature.
- Business logic for RecipeHybridEngine MUST live in Speckit specs/workflows
  only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In verification scenarios with known hard restrictions and
  dislikes, 100% of AI recipes accepted into the library are preference-safe and
  shared-schema valid.
- **SC-002**: When a planning shortfall of N preference-safe meals is requested
  and generation can succeed, callers obtain N new library recipes (or a clear
  shortfall report) without any accepted recipe violating hard dietary rules.
- **SC-003**: 100% of rejected unsafe or invalid AI candidates leave the
  household library unchanged (no partial invalid rows) in verification checks.
- **SC-004**: Substitution requests that would violate hard constraints are
  rejected 100% of the time in verification checks, with the original recipe
  unchanged.
- **SC-005**: Cross-household isolation checks show 0 recipes or preference
  inputs from household A visible to household B during generation,
  substitution, or library acceptance flows owned by this feature.
- **SC-006**: In verification scenarios with moderate shortfall (1–3 requested
  meals), every hybrid fill attempt either fully resolves the shortfall or
  returns an explicit unmet-count / failure reason within one caller attempt
  cycle (no silent empty success).

## Assumptions

- RecipeHybridEngine is the constitution follow-on deferred by GenerateWeeklyMeals
  / MealSuggestionEngine: those features select from the library and do not
  create AI recipes; this feature owns AI creation, dietary validation at
  acceptance, substitution, and optional seasonal/budget guidance.
- Delivery is a bounded internal service (generation + validation + library
  acceptance + substitution + P3 seasonal/budget soft guidance) with dedicated
  tests—not a redesign of curated Recipe CRUD (003) or MealSuggestionEngine
  ranking (011), and not GenerateWeeklyMeals orchestration wiring.
- Accepted AI recipes persist in the household library with `source = ai` so
  existing consumers can select them; ephemeral plan-only AI meals without
  library identity are out of scope for v1.
- Primary delivery surface is an internal RecipeHybridEngine service only
  (generate / hybrid fill / validate / substitute). No new organizer-facing
  generate or substitute surface. Planning workflows and GenerateWeeklyMeals may
  call the engine later; this feature does not change GenerateWeeklyMeals
  orchestration.
- Dietary hard-match and dislike matching reuse the same rules already locked
  for meal suggestion (hard restriction IDs on recipe dietary tags; case-
  insensitive exact phrase/token dislike matching on title and ingredient names).
- Shared schema field limits, unit catalog, dietary catalog, and 500-recipe
  library cap remain those defined by the Recipe feature.
- Ingredient substitution is single-ingredient per request with a required
  structured replacement (`name`, quantity, unit). Default mode creates a
  distinct AI-sourced library recipe. Replace-in-place is allowed only for
  existing AI-sourced recipes; curated recipes cannot be overwritten in place
  by this engine (callers must accept a distinct variant). Multi-ingredient
  batches and free-text/generator-invented replacements without structure are
  out of scope for v1.
- Seasonal and budget constraints are optional soft guidance expressed through
  existing recipe metadata (for example cuisine/style tags) rather than a second
  recipe model. Both are in delivery scope for this feature as P3.
- AI provider outages and unusable model output surface as clear generation
  failures; the product does not invent meals outside the validated acceptance
  path.
- Empty-member / empty-preference households remain evaluable: no hard
  restrictions means dietary hard-match does not exclude candidates, but schema
  validation still applies.
- Per requested recipe slot, validation failures trigger regeneration up to 3
  total attempts; unmet slots after that budget are reported as shortfall.
