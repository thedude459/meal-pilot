# Feature Specification: Recipes

**Feature Branch**: `003-recipe`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Recipe"

## Clarifications

### Session 2026-07-12

- Q: Must recipe titles be unique within a household library? → A: Duplicate titles allowed; each recipe has its own identity
- Q: How should recipe dietary attribute tags relate to the PreferenceProfile dietary restriction catalog? → A: Same catalog IDs as PreferenceProfile dietary restrictions
- Q: How should ingredient names be represented on a recipe? → A: Free-text names only (trimmed); no shared ingredient catalog in v1
- Q: What numeric form should ingredient quantities allow? → A: Positive decimal quantities allowed (greater than zero)
- Q: If the same dietary attribute tag ID is submitted more than once on one recipe save, what should happen? → A: Collapse duplicate tag IDs on save; keep first-seen order
- Q (analyze remediation): Library-at-cap HTTP mapping? → A: `RECIPE_LIBRARY_FULL` with HTTP 409; field limits remain `RECIPE_LIMIT` 400
- Q (analyze remediation): Cuisine tag duplicates? → A: Case-insensitive collapse with first-seen casing/order (aligned with likes)
- Q (analyze remediation): Ingredient name / step length caps? → A: 80 chars per ingredient name; 2000 chars per instruction step (promoted into FR-014)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a curated recipe (Priority: P1)

A household organizer adds a recipe to the household library with a title,
measurable ingredients, and ordered instructions so the household can reuse
that meal later in planning and shopping.

**Why this priority**: Without recipes on record, preference-aware meal planning
and grocery derivation have nothing structured to select or expand. Curated
recipe capture is the minimum viable foundation of Hybrid Recipe Sourcing.

**Independent Test**: Add one recipe with a title, at least one ingredient
(name, quantity, unit), and at least one instruction step; reopen it and
confirm all fields persist exactly as saved.

**Acceptance Scenarios**:

1. **Given** a household with no recipes, **When** the organizer adds a recipe
   with a title, one or more ingredients (each with name, quantity, and unit),
   and one or more ordered instruction steps, **Then** the recipe appears in the
   household library and can be opened with those values intact.
2. **Given** the organizer is adding a recipe, **When** they omit the title,
   provide no ingredients, or provide no instruction steps, **Then** the system
   rejects the add and explains what is required; no partial recipe is saved.
3. **Given** the organizer is adding an ingredient, **When** they omit name,
   quantity, or unit, provide a whitespace-only name, or provide a non-positive
   quantity, **Then** the system rejects that ingredient and does not save the
   recipe until all ingredients are valid.
4. **Given** a successfully saved recipe, **When** the organizer views it,
   **Then** its source is shown as curated and its structure matches the shared
   recipe schema used for all recipe sources.
5. **Given** the organizer submits the same dietary attribute tag ID more than
   once in one save, **When** the update succeeds, **Then** the recipe stores
   that tag once, in first-seen order among dietary tags.

---

### User Story 2 - Browse and view recipes (Priority: P2)

The organizer browses the household recipe library and opens a recipe to review
ingredients, quantities, instructions, and metadata before using it in planning.

**Why this priority**: Visibility confirms the library is usable and trustworthy;
secondary to the ability to add structured recipes.

**Independent Test**: With at least two known recipes in the library, open the
library list and one recipe detail and confirm titles, ingredient lines, and
instruction order match what was saved.

**Acceptance Scenarios**:

1. **Given** a household with multiple recipes (including two with the same
   title), **When** the organizer opens the recipe library, **Then** each recipe
   is listed and distinguishable as a separate entry even when titles match.
2. **Given** a saved recipe, **When** the organizer opens it, **Then** they see
   title, servings (if set), ingredients with quantities and units, ordered
   instruction steps, optional timing metadata, optional tags, and source.
3. **Given** a household with no recipes, **When** the organizer opens the
   library, **Then** they see an empty library state and can start adding a
   recipe.

---

### User Story 3 - Edit or remove a recipe (Priority: P3)

The organizer updates a recipe’s ingredients, instructions, or metadata, or
removes a recipe that the household no longer wants, so the library stays
accurate.

**Why this priority**: Libraries change over time; editing and removal keep data
correct but depend on recipes already existing.

**Independent Test**: Edit one recipe’s title and one ingredient quantity, save,
reopen and confirm changes; remove another recipe after confirmation and confirm
it no longer appears in the library.

**Acceptance Scenarios**:

1. **Given** an existing recipe, **When** the organizer updates title,
   ingredients, instructions, or metadata and saves, **Then** the library shows
   only the updated values.
2. **Given** the organizer submits an invalid edit (blank title, no ingredients,
   no steps, or invalid ingredient lines), **When** they save, **Then** the
   system rejects the update and leaves the last successfully saved recipe
   unchanged.
3. **Given** an existing recipe, **When** the organizer confirms removal,
   **Then** the recipe is permanently removed from the household library and
   cannot be restored.
4. **Given** the organizer starts removal, **When** they cancel confirmation,
   **Then** the recipe remains in the library unchanged.

---

### User Story 4 - Shared schema readiness for hybrid sourcing (Priority: P4)

The system treats every recipe—whether curated now or AI-generated later—as the
same structured meal definition so planning, grocery, and dietary validation
consumers do not need separate shapes.

**Why this priority**: Constitution Hybrid Recipe Sourcing requires one schema;
this story locks that contract without delivering AI generation in this feature.

**Independent Test**: Inspect saved curated recipes and confirm each exposes the
shared fields (identity, title, ingredients, instructions, metadata, source)
and that source is explicitly curated; confirm AI generation is not offered as
part of this feature’s flows.

**Acceptance Scenarios**:

1. **Given** any saved recipe from this feature, **When** a downstream consumer
   reads it, **Then** it receives the shared recipe shape including source
   (`curated` for recipes created here).
2. **Given** the organizer is managing the recipe library, **When** they use
   this feature’s flows, **Then** they can create and edit curated recipes only;
   AI generation is not part of add/edit in this feature.
3. **Given** a recipe with dietary attribute tags drawn from the PreferenceProfile
   dietary restriction catalog, **When** a dietary-validation consumer reads the
   recipe, **Then** those tag identifiers match the same catalog IDs used for
   member hard restrictions, without a separate recipe-only dietary catalog.

---

### Edge Cases

- Empty household recipe libraries are valid; organizers may add the first
  recipe at any time.
- Recipe create/update applies only on successful validation; invalid submissions
  leave the library unchanged.
- Concurrent or overlapping saves for the same recipe use last successful full
  replace wins; there is no merge of concurrent edits and no optimistic version
  check in v1.
- Ingredient names that are blank or whitespace-only are rejected. Ingredient
  names are free-text (trimmed); there is no shared ingredient catalog in v1.
- Ingredient quantities MUST be greater than zero and MAY be decimals (for
  example 1.5 or 0.25); zero and negative quantities are rejected.
- Instruction steps that are blank or whitespace-only are rejected; empty steps
  are not stored.
- Duplicate ingredient lines are kept as submitted after trimming names; the
  system does not silently merge quantities for matching ingredient names.
- Removing a recipe does not cascade-delete FamilyMembers, PreferenceProfiles,
  pantry, or grocery data; linkage to weekly plans is owned by future planning
  features (orphaned plan references must be handled by those features).
- Servings, prep time, and cook time are optional; when provided, servings must
  be a positive whole number and times must be non-negative durations.
- Dietary attribute tags, when present, MUST use the same predefined catalog
  identifiers as PreferenceProfile dietary restrictions; unknown identifiers are
  rejected on save. Duplicate tag IDs in one save are collapsed to a single
  entry, preserving first-seen order.
- Cuisine/style tags: blanks dropped; case-insensitive duplicates collapsed
  (first-seen casing and order); over-length or over-count after normalization
  rejects the entire save.
- Source for recipes created or edited in this feature is always `curated`;
  organizers cannot mark a hand-entered recipe as AI-generated.
- Recipe title max length and library size limits apply (see requirements); over-
  limit submissions are rejected entirely.
- Duplicate titles within a household are allowed; recipes are distinguished by
  identity, not by title uniqueness.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a household organizer to create a curated Recipe
  in the household library with a non-empty title, one or more Ingredients, and
  one or more ordered instruction steps.
- **FR-002**: System MUST require each Ingredient to include a non-empty
  free-text name (after trim), a positive quantity that MAY be a decimal
  (greater than zero), and a unit; ingredient names are not drawn from a shared
  ingredient catalog in v1. Invalid ingredient lines MUST cause the entire create
  or update to be rejected.
- **FR-003**: System MUST persist Recipes so they survive session restarts and
  remain available in the household library.
- **FR-004**: System MUST allow the organizer to view the household recipe
  library (list) and open any recipe’s full details.
- **FR-005**: System MUST allow the organizer to replace an existing Recipe’s
  title, ingredients, instructions, and metadata via a full replace on
  successful save; when saves overlap, the last successful replace wins (no
  merge of concurrent edits).
- **FR-006**: System MUST allow the organizer to permanently remove a Recipe
  after explicit confirmation; cancelled confirmation MUST leave the recipe
  unchanged.
- **FR-007**: System MUST reject create/update when title is blank/whitespace-
  only, when there are zero valid ingredients, when there are zero valid
  instruction steps, when any instruction step is blank/whitespace-only after
  trim, or when optional numeric metadata is invalid; the prior saved recipe
  (if any) MUST remain unchanged.
- **FR-008**: Every Recipe MUST use one shared structured schema whether its
  source is curated or (later) AI-generated. Recipes created or updated in this
  feature MUST have source `curated`.
- **FR-009**: System MUST NOT provide AI recipe generation inside this feature’s
  create/edit flows; AI generation remains a future `RecipeHybridEngine`
  capability that MUST emit the same schema.
- **FR-010**: System MUST support optional recipe metadata: servings (positive
  whole number), prep time, cook time (non-negative durations), free-text tags
  for cuisine/style, and dietary attribute tags selected only from the same
  predefined dietary restriction catalog used by PreferenceProfile (identical
  stable identifiers) for downstream dietary validation.
- **FR-011**: System MUST reject dietary attribute tag values that are not on the
  PreferenceProfile dietary restriction catalog and MUST NOT partially apply an
  invalid update. On save, System MUST collapse duplicate dietary attribute tag
  IDs to a single entry, preserving first-seen order among tags.
- **FR-012**: System MUST keep Recipes scoped to the household library; recipes
  in one household MUST NOT appear in another.
- **FR-013**: System MUST expose Recipes to downstream consumers (meal planning,
  grocery derivation, dietary validation) in the shared schema without requiring
  those consumers to know whether a recipe was hand-entered.
- **FR-014**: System MUST enforce a maximum title length of 120 characters after
  trim; a maximum ingredient name length of 80 characters after trim; a maximum
  of 60 ingredients per recipe; a maximum of 40 instruction steps per recipe;
  a maximum of 2000 characters per instruction step after trim; and a maximum of
  500 recipes per household library. Field/limit violations MUST reject with a
  limit error and leave prior data unchanged. Exceeding the household library
  cap on create MUST reject without inserting a row (distinct from field-limit
  errors — see Assumptions / plan for HTTP mapping).
- **FR-015**: System MUST preserve instruction step order and ingredient list
  order as saved (after trimming text fields) for stable display and for
  consumers that expand recipes into grocery lines.
- **FR-016**: Ingredient units MUST be selected from a predefined unit catalog
  (for example volume, mass, count); free-text units outside the catalog MUST be
  rejected.
- **FR-017**: On save, System MUST ignore blank or whitespace-only cuisine/style
  tags, MUST collapse case-insensitive duplicate cuisine/style tags preserving
  first-seen casing and relative order, MUST reject any cuisine/style tag longer
  than 40 characters after trim, and MUST reject more than 20 cuisine/style tags
  per recipe after normalization; dietary attribute tags remain catalog-backed
  and are not counted toward the cuisine/style cap.
- **FR-018**: System MUST allow multiple Recipes in the same household library to
  share the same title (including case-insensitive matches after trim). Recipes
  MUST be distinguishable by stable identity, not by title uniqueness.

### Key Entities *(include if feature involves data)*

- **Recipe**: A meal definition belonging to a household library, identified by a
  stable identity independent of title. Includes title (not required unique within
  the household), ordered Ingredients, ordered instruction steps, optional
  servings and timing metadata, optional cuisine/style tags, optional dietary
  attribute tags, and a source (`curated` | `ai`). Curated recipes are managed by
  this feature; AI-sourced instances must share the same shape when introduced
  later.
- **Ingredient**: A measurable food line on a Recipe: free-text name (trimmed;
  no shared ingredient catalog in v1), positive quantity (decimal allowed,
  greater than zero), and unit from the unit catalog. Used later by grocery and
  pantry features, which own any future identity matching or catalog mapping.
- **DietaryAttributeTag (catalog entry)**: A dietary annotation on a Recipe that
  MUST use the same predefined catalog as PreferenceProfile dietary restrictions
  (identical stable identifiers and display labels). Used by dietary-validation
  consumers to compare recipes against member `hardRestrictions`.
- **Unit (catalog entry)**: A predefined measurement unit with a stable
  identifier and display label for ingredient quantities.

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences, dietary restrictions, and dislikes MUST be honored by downstream
  meal planning that selects Recipes; this feature stores dietary attribute tags
  on recipes for those consumers and does not generate weekly plans.
- Grocery lists MUST derive from approved meals and subtract pantry inventory;
  this feature exposes structured Ingredients so those consumers can expand
  recipes later.
- AI-generated recipes MUST share the curated schema and pass dietary validation;
  this feature defines and uses that shared schema for curated recipes and does
  not generate AI recipes.
- Non-AI behavior (curated create, view, update, remove) MUST remain
  deterministic.
- Business logic for Recipe and Ingredient MUST live in Speckit specs/workflows
  only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Organizers can add a recipe with title, at least one valid
  ingredient, and at least one instruction step, leave and return, and see 100%
  of saved fields retained in verification checks.
- **SC-002**: 95% of organizers complete adding a simple recipe (title, ≤5
  ingredients, ≤5 steps) in under 5 minutes without assistance.
- **SC-003**: Invalid creates/updates (missing title, ingredients, or steps;
  invalid quantities; unknown units or dietary tags; over library/recipe limits)
  are blocked 100% of the time in verification checks, with prior saved data
  unchanged.
- **SC-004**: After confirmed removal, the recipe is absent from the library in
  100% of verification checks; cancelled removal leaves the recipe present.
- **SC-005**: Every recipe returned to a consumer includes the shared schema
  fields and an explicit source value in 100% of sampled reads.
- **SC-006**: Recipe edits in one household never appear in another household’s
  library in cross-household verification checks.
- **SC-007**: Reopening a recipe shows ingredients and instruction steps in the
  same relative order as after the last successful save.

## Assumptions

- Family Member Profiles and Preference Profiles already exist; this feature does
  not redefine roster or preference rules.
- v1 delivers a household-scoped curated recipe library with the shared hybrid
  schema; AI recipe generation, suggestion ranking, ingredient substitution,
  seasonal/budget filtering, and weekly plan attachment are out of scope and
  owned by future `RecipeHybridEngine` / meal-planning features.
- A single household organizer manages the recipe library; per-member recipe
  ownership and sharing outside the household are out of scope.
- Global/seed recipe catalogs and import from external recipe sites are out of
  scope for v1.
- Ingredient quantity arithmetic across recipes (merge for grocery) is owned by
  grocery features; this feature only stores per-recipe lines. Ingredient names
  are free-text only in v1; a shared ingredient catalog is out of scope.
  Quantities are positive decimals (greater than zero), not whole-numbers-only.
- Dietary validation of a recipe against a PreferenceProfile happens in
  planning/AI consumers, not as a blocking check on curated save beyond
  requiring known dietary attribute tag IDs when tags are supplied.
- Units come from a small predefined catalog (common cooking units); custom
  units are out of scope for v1.
- Recipe dietary attribute tags reuse the PreferenceProfile dietary restriction
  catalog IDs (no separate recipe-only dietary catalog). Duplicate dietary tag
  IDs on one save are collapsed (first-seen order), consistent with
  PreferenceProfile restriction handling.
- Cuisine/style tags are free-text labels capped at 40 characters each and at most
  20 per recipe after blank removal and case-insensitive duplicate collapse
  (FR-017); dietary attribute tags are catalog-backed.
- Ingredient names are capped at 80 characters; instruction steps at 2000
  characters each (FR-014).
- Field/count limit violations use error code `RECIPE_LIMIT` (HTTP 400).
  Household library full (500) uses `RECIPE_LIBRARY_FULL` (HTTP 409), parallel to
  FamilyMember `MEMBER_LIMIT`.
- Recipe titles are not unique within a household; identity is independent of
  title (FR-018).
- Concurrent recipe saves are last-write-wins on full replace; optimistic locking
  is out of scope for v1.
- Confirmation UX for delete and discard of unsaved edits is client/UI concern
  except that removal MUST require an explicit confirm step before permanent
  delete.
- Linking recipes into WeeklyPlan slots, approving/rejecting meals, and pantry
  subtraction are not delivered by this feature.
