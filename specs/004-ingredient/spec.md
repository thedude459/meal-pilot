# Feature Specification: Ingredients

**Feature Branch**: `004-ingredient`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Ingredient"

## Clarifications

### Session 2026-07-12

- Q: How should organizers find ingredients when browsing the catalog? → A: Sorted A–Z by display name (case-insensitive); no search/filter in v1
- Q: Can an organizer clear a previously set shopping category on update? → A: Allow clearing category on update (unset/none is valid)
- Q: May an alias match that ingredient’s own display name? → A: Reject alias that matches own display name (case-insensitive)
- Q: How are display names and aliases normalized before uniqueness and storage? → A: Trim ends and collapse consecutive Unicode whitespace (`\s`) to one ASCII space
- Q: What counts as “internal whitespace” when normalizing labels? → A: Any Unicode whitespace (`\s`); collapse runs to one ASCII space
- Q: If a rename makes the new display name match an alias on the same save, what happens? → A: Reject the entire save when new display name matches any submitted alias
- Q: On full replace, may shoppingCategoryId or aliases be omitted? → A: No — both required on PUT; null clears category; [] clears aliases; omit → VALIDATION_ERROR

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add an ingredient to the household catalog (Priority: P1)

A household organizer adds a measurable food item to the household ingredient
catalog so pantry, grocery, and later recipe identity matching can refer to the
same named item instead of ad-hoc free-text strings.

**Why this priority**: Without a shared Ingredient catalog, grocery merge,
pantry tracking, and ingredient substitution lack a stable identity. Catalog
capture is the minimum viable foundation for constitution-defined Ingredient
behavior.

**Independent Test**: Add one ingredient with a display name and a default unit;
reopen it and confirm the name, unit, and optional shopping category persist
exactly as saved.

**Acceptance Scenarios**:

1. **Given** a household with no catalog ingredients, **When** the organizer
   adds an ingredient with a non-empty display name and a default unit from the
   unit catalog, **Then** the ingredient appears in the household catalog and
   can be opened with those values intact.
2. **Given** the organizer is adding an ingredient, **When** they omit the
   display name, provide a whitespace-only name, or omit/select an unknown
   default unit, **Then** the system rejects the add and explains what is
   required; no partial ingredient is saved.
3. **Given** a household that already has an ingredient named "Olive oil"
   (any casing or extra internal spaces that normalize equivalently), **When**
   the organizer tries to add another ingredient whose name normalizes to the
   same value, **Then** the system rejects the add and explains that the name is
   already in use; the existing ingredient is unchanged.
4. **Given** the organizer adds an ingredient with an optional shopping
   category from the predefined shopping-category catalog, **When** the add
   succeeds, **Then** that category is stored and shown on the ingredient.
5. **Given** a successfully saved ingredient, **When** the organizer views it,
   **Then** it is identifiable as a household catalog Ingredient (stable
   identity independent of display name changes after creation).

---

### User Story 2 - Browse and view the ingredient catalog (Priority: P2)

The organizer browses the household ingredient catalog and opens an ingredient
to confirm name, default unit, shopping category, and aliases before using it
in pantry or grocery workflows.

**Why this priority**: Visibility confirms the catalog is usable and
trustworthy; secondary to the ability to add structured ingredients.

**Independent Test**: With at least two known ingredients in the catalog, open
the catalog list and one ingredient detail and confirm names, units, and
categories match what was saved.

**Acceptance Scenarios**:

1. **Given** a household with multiple catalog ingredients, **When** the
   organizer opens the catalog, **Then** each ingredient is listed with its
   display name, distinguishable as a separate entry, and ordered A–Z by
   display name (case-insensitive).
2. **Given** a saved ingredient, **When** the organizer opens it, **Then** they
   see display name, default unit, shopping category (if set), and any aliases.
3. **Given** an empty household catalog, **When** the organizer opens the
   catalog, **Then** they see an empty list and can still start an add.

---

### User Story 3 - Update or remove a catalog ingredient (Priority: P2)

The organizer corrects an ingredient’s name, default unit, shopping category,
or aliases, or removes an ingredient that should no longer appear in the
catalog.

**Why this priority**: Catalog hygiene keeps pantry and grocery identity stable;
depends on ingredients already existing.

**Independent Test**: Edit one ingredient’s display name and default unit, save,
reopen and confirm; then remove a different ingredient and confirm it no longer
appears in the catalog.

**Acceptance Scenarios**:

1. **Given** a saved ingredient, **When** the organizer updates display name,
   default unit, shopping category, or aliases and saves, **Then** the catalog
   shows the updated values on reopen.
2. **Given** a saved ingredient with a shopping category, **When** the organizer
   clears the shopping category and saves, **Then** the ingredient has no
   shopping category on reopen.
3. **Given** the organizer submits an invalid edit (blank name, unknown unit,
   unknown shopping category, a name that collides with another catalog
   ingredient, a display name that matches a submitted alias, or omits
   `shoppingCategoryId` or `aliases` on PUT), **When** they save, **Then** the
   system rejects the update and leaves the prior ingredient unchanged.
4. **Given** a saved ingredient, **When** the organizer confirms removal,
   **Then** the ingredient is permanently removed from the household catalog and
   no longer appears in list or detail views.
5. **Given** the organizer renames an ingredient, **When** the new name would
   collide with another ingredient in the same household (case-insensitive after
   normalization), **Then** the rename is rejected and the original name remains.
6. **Given** the organizer renames an ingredient and includes aliases on the same
   save, **When** the new display name matches any of those aliases after
   normalization, **Then** the entire save is rejected and the prior ingredient
   remains unchanged.

---

### User Story 4 - Maintain aliases for matching (Priority: P3)

The organizer records alternate names (aliases) for an ingredient so later
grocery and pantry features can recognize free-text recipe lines that mean the
same item (for example "scallion" and "green onion").

**Why this priority**: Aliases improve future identity matching but are not
required for a usable catalog MVP.

**Independent Test**: On one ingredient, save two distinct aliases; reopen and
confirm both persist in saved order; attempt a duplicate alias and confirm it is
collapsed or rejected per normalization rules.

**Acceptance Scenarios**:

1. **Given** a saved ingredient, **When** the organizer adds one or more
   non-empty aliases and saves, **Then** those aliases appear on the ingredient
   in the order saved after normalization.
2. **Given** the organizer submits blank or whitespace-only aliases, **When**
   they save, **Then** those empty aliases are discarded and do not appear.
3. **Given** the organizer submits the same alias more than once (including
   case variants) on one ingredient, **When** the save succeeds, **Then** the
   ingredient stores that alias once, in first-seen order.
4. **Given** an alias that matches another ingredient’s display name or alias
   in the same household (case-insensitive), **When** the organizer saves,
   **Then** the system rejects the update and leaves the prior ingredient
   unchanged.
5. **Given** an alias that matches the same ingredient’s own display name
   (case-insensitive), **When** the organizer saves, **Then** the system rejects
   the update and leaves the prior ingredient unchanged.
6. **Given** the organizer renames an ingredient while also submitting aliases,
   **When** the new display name matches any submitted alias after normalization,
   **Then** the system rejects the entire save and leaves the prior ingredient
   unchanged.

---

### Edge Cases

- Blank or whitespace-only display names and aliases are rejected or discarded
  per the rules above; labels are normalized by trimming ends and collapsing
  consecutive Unicode whitespace (`\s`) to a single ASCII space before
  validation, uniqueness checks, and storage.
- Name uniqueness is case-insensitive within the household across display names
  and aliases (no two catalog entries may claim the same normalized label). An
  alias MUST NOT match its own Ingredient’s display name on the same save
  (including renames); conflicting saves are rejected entirely.
- Unknown default unit IDs or shopping-category IDs are rejected; the prior
  ingredient (on update) or no new ingredient (on create) remains. Clearing a
  shopping category with `shoppingCategoryId: null` on PUT is valid. Omitting
  `shoppingCategoryId` or `aliases` on PUT is rejected (`VALIDATION_ERROR`).
- Removing an ingredient that is not referenced by pantry/grocery yet succeeds
  immediately; references from future pantry/grocery features are out of scope
  for this feature’s delete semantics beyond permanent catalog removal.
- Catalog size limits: adds beyond the household ingredient cap are rejected
  without creating a partial entry.
- Concurrent full replaces on the same ingredient: last successful save wins; no
  field-level merge.
- Recipe ingredient lines remain free-text in the Recipes feature; this catalog
  does not rewrite or require recipe lines to reference Ingredient IDs in v1.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a household organizer to create an Ingredient in
  the household catalog with a non-empty display name (after normalization) and
  a default unit selected from the predefined unit catalog shared with Recipes.
  Display names MUST be normalized by trimming ends and collapsing consecutive
  Unicode whitespace (`\s`) to a single ASCII space before validation and
  storage.
- **FR-002**: System MUST reject creates and updates that omit a valid display
  name, omit a valid default unit, or reference an unknown unit; invalid
  requests MUST NOT partially save. On full replace (PUT), System MUST also
  require `shoppingCategoryId` (nullable) and `aliases` (array, may be empty);
  omitting either field MUST be rejected as validation failure without changing
  the prior ingredient.
- **FR-003**: System MUST enforce case-insensitive uniqueness of display names
  and aliases within a household so that no two Ingredients claim the same
  normalized label. Normalization for uniqueness and storage is: trim ends,
  collapse consecutive Unicode whitespace (`\s`) to one ASCII space, then
  case-insensitive compare.
- **FR-004**: System MUST allow an optional shopping category on each Ingredient,
  selected only from a predefined shopping-category catalog; unknown category
  IDs MUST be rejected. On update, organizers MUST be able to clear a previously
  set category by submitting `shoppingCategoryId: null` (field required on PUT).
- **FR-005**: System MUST allow organizers to list all Ingredients in the
  household catalog ordered A–Z by display name (case-insensitive) and open any
  Ingredient by identity to view its current fields. Search and filter are out
  of scope for v1.
- **FR-006**: System MUST allow organizers to update an Ingredient via a full
  replace of mutable fields (display name, default unit, shopping category,
  aliases), including clearing shopping category with `null` and clearing
  aliases with `[]`; last successful replace wins.
- **FR-007**: System MUST allow organizers to permanently remove an Ingredient
  from the household catalog after confirmation; removed Ingredients MUST NOT
  appear in subsequent list or detail views.
- **FR-008**: System MUST support zero or more aliases per Ingredient; blank
  aliases MUST be discarded; aliases MUST be normalized the same way as display
  names (trim ends; collapse consecutive Unicode whitespace); duplicate aliases
  (case-insensitive) on one save MUST collapse to first-seen order. An alias
  that matches the Ingredient’s own display name (case-insensitive after
  normalization)—including when a rename makes the new display name match any
  alias submitted on the same save—MUST cause the entire save to be rejected
  (prior state unchanged). No aliases are silently dropped to resolve the
  conflict.
- **FR-009**: System MUST expose the predefined shopping-category catalog with
  stable identifiers and human-readable labels for organizers selecting a
  category.
- **FR-010**: System MUST reuse the same predefined unit catalog as Recipes for
  Ingredient default units (no separate ingredient-only unit list).
- **FR-011**: System MUST enforce field and catalog limits: display name max 80
  characters after normalization; each alias max 80 characters after
  normalization; max 20 aliases per Ingredient after normalization; max 500
  Ingredients per household; adds beyond the cap MUST be rejected with a clear
  limit explanation.
- **FR-012**: System MUST preserve alias order after normalization and MUST keep
  Ingredient identity stable across display-name changes.
- **FR-013**: System MUST NOT require Recipes to reference Ingredient catalog
  IDs in this feature; recipe lines remain free-text per the Recipes feature
  until a later linking feature.
- **FR-014**: System MUST scope the Ingredient catalog per household; one
  household’s catalog MUST NOT be visible or editable as another household’s.

### Key Entities *(include if feature involves data)*

- **Ingredient**: A measurable food item in a household catalog. Has stable
  identity, display name (normalized: trim ends, collapse consecutive Unicode
  whitespace; unique case-insensitively with aliases in the household),
  displayNameKey for DB uniqueness, default unit from the unit catalog, optional
  shopping category from the shopping-category catalog, and ordered aliases.
  Used later by grocery, pantry, and substitution consumers as the shared food
  identity.
- **ShoppingCategory (catalog entry)**: A predefined grocery grouping (for
  example produce, dairy, pantry staples) with a stable identifier and display
  label. Mapped onto Ingredient for later GroceryItem categorization.
- **Unit (catalog entry)**: Reused from Recipes — predefined measurement unit
  with stable identifier and display label (volume, mass, or count).
- **Household (dependency)**: Scopes the Ingredient catalog (same household
  boundary as FamilyMember and Recipe libraries).

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences, dietary restrictions, and dislikes MUST be honored by later
  planning consumers; this feature does not attach dietary flags to Ingredient
  in v1.
- Grocery lists MUST derive from approved meals and subtract pantry inventory;
  this feature supplies the shared Ingredient identity and shopping category
  those workflows will use.
- AI-generated recipes MUST share the curated schema and pass dietary
  validation; this feature does not change recipe schema or AI generation.
- Non-AI behavior MUST remain deterministic.
- Business logic for Ingredient MUST live in Speckit specs/workflows only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Organizers can add an ingredient with name and default unit, leave
  and return, and see 100% of those fields persisted as saved.
- **SC-002**: Organizers can complete adding a typical ingredient (name, unit,
  optional category) in under 2 minutes without assistance.
- **SC-003**: Invalid creates/updates (blank name, unknown unit/category, name
  or alias collisions including alias equal to own display name, over
  catalog/alias limits) are rejected 100% of the time with a clear explanation,
  and no partial catalog entry is written.
- **SC-004**: In usability checks, at least 90% of organizers can locate a
  known ingredient in a catalog of 20+ items (using the A–Z list order) and open
  its detail on the first attempt.
- **SC-005**: Case-insensitive duplicate display names or cross-ingredient
  alias collisions are prevented 100% of the time within a household.
- **SC-006**: Reopening an ingredient shows aliases in the same relative order
  as last successfully saved after normalization.
- **SC-007**: After confirmed removal, the ingredient is absent from catalog
  list and detail on 100% of subsequent views.

## Assumptions

- Target user is the household organizer (same actor model as Family Member,
  Preference Profile, and Recipe features).
- Ingredient catalog is household-scoped, not a global system-wide food database.
- Display names and aliases are unique together within a household using
  case-insensitive comparison after normalization (trim ends; collapse
  consecutive Unicode whitespace (`\s`) to one ASCII space); an ingredient’s
  aliases must not match its own display name; uniqueness across households is
  not required.
- Default unit is required so pantry and grocery quantity math have a starting
  unit; unit conversion between kinds is out of scope for this feature.
- Shopping category is optional on create and may be cleared with
  `shoppingCategoryId: null` on PUT (field required on replace); when set it
  must come from a small predefined shopping-category catalog (produce,
  meat/seafood, dairy, bakery, frozen, canned/jarred, dry goods, spices,
  beverages, other).
- Dietary/allergen flags on Ingredient are out of scope for v1; preference and
  restriction matching remains at member/recipe/meal levels.
- Linking Recipe free-text ingredient lines to catalog Ingredient IDs is out of
  scope for this feature (Recipes v1 explicitly uses free-text names only).
  Aliases exist to support that future matching, not to rewrite recipes now.
- PantryItem and GroceryItem features will consume Ingredient identity later;
  this feature owns catalog CRUD only, not pantry quantities or grocery list
  generation.
- Household ingredient cap is 500 entries; alias cap is 20 per ingredient;
  name/alias length cap is 80 characters (aligned with recipe ingredient name
  length).
- Concurrent edits use last-successful-full-replace semantics (aligned with
  Preference Profile and Recipe).
- Seed/import of a large external food database is out of scope; organizers
  build the household catalog as needed.
- Catalog browse is A–Z by display name only; name search/filter is deferred
  beyond v1.
- SC-002 and SC-004 are manual UX outcomes (time-to-add and findability demos),
  not automated harness gates.
- Multi-household auth and switching remain as established by earlier features;
  this feature only enforces per-household catalog isolation.
