# Feature Specification: Pantry Items

**Feature Branch**: `005-pantry-item`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "PantryItem"

## Clarifications

### Session 2026-07-12

- Q: When a catalog Ingredient is deleted, what should happen to a PantryItem that references it? → A: Block Ingredient delete until the pantry item is removed
- Q: What numeric form should pantry quantities allow? → A: Positive decimals, rounded/stored to at most 3 decimal places (same as Recipes)
- Q: Must a PantryItem’s unit match the linked Ingredient’s default unit? → A: Must be the linked Ingredient’s default unit
- Q: When an expiration date is set, which calendar dates are allowed? → A: Any calendar date (past, today, or future)
- Q: On full replace of a PantryItem, which fields must be present? → A: quantity, unit, and expiration all required; expiration none clears it; omitting any field rejects the save

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record pantry stock for a catalog ingredient (Priority: P1)

A household organizer records that the household has a measurable amount of a
known catalog Ingredient on hand (quantity and unit), so later grocery
generation can subtract what is already available instead of shopping for it
again.

**Why this priority**: Without pantry stock, grocery lists cannot honor
Pantry-Aware Inventory. Capturing quantity and unit against Ingredient identity
is the minimum viable foundation for constitution-defined PantryItem behavior.

**Independent Test**: With at least one Ingredient already in the household
catalog, add a pantry item for that ingredient with quantity and unit; reopen it
and confirm ingredient, quantity, unit, and optional expiration persist exactly
as saved.

**Acceptance Scenarios**:

1. **Given** a household catalog Ingredient and no pantry stock for it, **When**
   the organizer adds a pantry item with a positive quantity (decimal allowed)
   and the Ingredient’s default unit, **Then** the pantry item appears for that
   household and can be opened with those values intact (quantity stored to at
   most 3 decimal places).
2. **Given** the organizer is adding a pantry item, **When** they omit the
   ingredient, reference an unknown ingredient, omit quantity, provide a
   non-positive quantity, omit unit, select an unknown unit, or select a unit
   that is not the Ingredient’s default unit, **Then** the system rejects the
   add and explains what is required; no partial pantry item is saved.
3. **Given** the household already has a pantry item for ingredient "Olive oil",
   **When** the organizer tries to add another pantry item for the same
   ingredient, **Then** the system rejects the add and explains that stock for
   that ingredient already exists; the existing pantry item is unchanged.
4. **Given** the organizer adds a pantry item with an optional expiration date
   (including a past or today date), **When** the add succeeds, **Then** that
   expiration is stored and shown on the pantry item.
5. **Given** a successfully saved pantry item, **When** the organizer views it,
   **Then** it is identifiable as household pantry stock for a specific
   Ingredient (stable pantry identity independent of later quantity changes).

---

### User Story 2 - Browse and view pantry inventory (Priority: P2)

The organizer browses household pantry inventory and opens a pantry item to
confirm which Ingredient it is, how much is on hand, the unit, and optional
expiration before relying on it for grocery planning.

**Why this priority**: Visibility confirms inventory is usable and trustworthy;
secondary to the ability to record stock.

**Independent Test**: With at least two known pantry items, open the pantry list
and one detail view and confirm ingredient identity, quantities, units, and
expirations match what was saved.

**Acceptance Scenarios**:

1. **Given** a household with multiple pantry items, **When** the organizer
   opens the pantry, **Then** each item is listed with its Ingredient display
   name, quantity, and unit, distinguishable as a separate entry, and ordered
   A–Z by Ingredient display name (case-insensitive).
2. **Given** a saved pantry item, **When** the organizer opens it, **Then** they
   see Ingredient identity and display name, quantity, unit, and expiration (if
   set).
3. **Given** an empty pantry, **When** the organizer opens the pantry, **Then**
   they see an empty list and can still start an add for a catalog Ingredient.

---

### User Story 3 - Update or remove pantry stock (Priority: P2)

The organizer corrects quantity, unit, or expiration for an existing pantry
item, or removes stock that is no longer on hand, so grocery subtraction stays
accurate.

**Why this priority**: Inventory hygiene keeps grocery lists trustworthy;
depends on pantry items already existing.

**Independent Test**: Edit one pantry item’s quantity and unit, save, reopen and
confirm; then remove a different pantry item and confirm it no longer appears.

**Acceptance Scenarios**:

1. **Given** a saved pantry item, **When** the organizer updates quantity, unit,
   or expiration and saves, **Then** the pantry shows the updated values on
   reopen.
2. **Given** a saved pantry item with an expiration, **When** the organizer
   clears the expiration and saves, **Then** the pantry item has no expiration
   on reopen.
3. **Given** the organizer submits an invalid edit (non-positive quantity,
   unknown unit, unit that is not the Ingredient’s default unit, omits
   quantity, unit, or expiration on full replace, or a change that would leave
   stock invalid), **When** they save, **Then** the system rejects the update
   and leaves the prior pantry item unchanged.
4. **Given** a saved pantry item, **When** the organizer confirms removal,
   **Then** the pantry item is permanently removed from household inventory and
   no longer appears in list or detail views.
5. **Given** a saved pantry item, **When** the organizer attempts to change which
   Ingredient it refers to, **Then** the system rejects that change; Ingredient
   linkage is fixed at create time (remove and re-add if a different Ingredient
   is needed).
6. **Given** a saved pantry item, **When** the organizer full-replaces it and
   omits quantity, unit, or expiration, **Then** the system rejects the save as
   validation failure and the prior pantry item remains unchanged.
7. **Given** a saved pantry item, **When** the organizer full-replaces it and
   includes a new or same Ingredient identity in the replace payload, **Then**
   the system rejects the save as validation failure and the prior pantry item
   remains unchanged.

---

### User Story 4 - Spot soon-to-expire stock (Priority: P3)

The organizer reviews pantry items that have expiration dates so they can use
food before it goes bad and keep inventory realistic for planning.

**Why this priority**: Expiration awareness improves trust and reduces waste but
is not required for quantity-based grocery subtraction MVP.

**Independent Test**: With at least two pantry items that have different
expiration dates (and optionally one without expiration), open the pantry and
confirm dates are visible on list/detail; confirm a past or today date is still
stored and shown without silent deletion.

**Acceptance Scenarios**:

1. **Given** pantry items with expiration dates, **When** the organizer opens
   the pantry list or a detail view, **Then** each set expiration date is
   visible alongside quantity and unit.
2. **Given** a pantry item whose expiration date is today or in the past,
   **When** the organizer views the pantry, **Then** the item remains listed
   with that date (no automatic removal in this feature).
3. **Given** a pantry item without an expiration, **When** the organizer views
   it, **Then** quantity and unit still display normally with no expiration
   shown.

---

### Edge Cases

- Creates and updates require a positive quantity that MAY be a decimal;
  quantities are rounded/stored to at most 3 decimal places (same rule as
  Recipes). Zero or negative quantities are rejected without partial save.
  Out-of-stock is represented by removing the pantry item, not by storing zero.
- Only one pantry item may exist per Ingredient per household; duplicate creates
  for the same Ingredient are rejected.
- Unknown Ingredient IDs or unit IDs are rejected; a unit that is not the linked
  Ingredient’s current default unit is rejected. The prior pantry item (on
  update) or no new item (on create) remains. If the Ingredient’s default unit
  later changes, existing pantry rows are not auto-converted; subsequent
  updates MUST use the Ingredient’s current default unit.
- Expiration is optional on create; when set, past, today, and future calendar
  dates are all valid. On full replace, quantity, unit, and expiration are all
  required: expiration set to none clears it; omitting any of those three fields
  is rejected without changing prior state. Partial field updates are not
  supported.
- Ingredient linkage cannot change after create; organizers remove and re-add
  to stock a different Ingredient. Replace requests that include an Ingredient
  identity field MUST be rejected (not silently ignored).
- If the linked Ingredient’s default unit later changes, existing pantry rows
  are not auto-converted; a subsequent replace that still uses the prior unit
  MUST be rejected until the organizer supplies the Ingredient’s current
  default unit.
- Removing a pantry item succeeds immediately in this feature; automatic
  Increment/decrement from grocery confirmation or meal cooking is out of scope
  here.
- Pantry size limits: adds beyond the household pantry cap are rejected without
  creating a partial entry.
- Concurrent full replaces on the same pantry item: last successful save wins; no
  field-level merge.
- Deleting a catalog Ingredient that still has a PantryItem in the household is
  blocked until that pantry item is removed; no silent cascade or orphan stock.
  Renaming an Ingredient does not change the pantry linkage (identity is stable).
- This feature does not build grocery lists or subtract stock during shopping
  list generation; those workflows consume PantryItem later.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a household organizer to create a PantryItem for
  a household catalog Ingredient with a positive quantity (decimal allowed,
  greater than zero) and a unit that MUST be the linked Ingredient’s default
  unit from the predefined unit catalog shared with Recipes and Ingredients.
  Quantities MUST be rounded/stored to at most 3 decimal places (same rule as
  Recipes).
- **FR-002**: System MUST reject creates and updates that omit a valid
  Ingredient reference, omit a positive quantity, omit a valid unit, reference
  an unknown Ingredient or unit, or use a unit other than the linked
  Ingredient’s default unit; invalid requests MUST NOT partially save.
- **FR-003**: System MUST enforce at most one PantryItem per Ingredient per
  household; a create that would duplicate an existing Ingredient’s stock MUST
  be rejected without changing the existing item.
- **FR-004**: System MUST allow an optional expiration date on each PantryItem;
  when present it MUST be a calendar date and MAY be in the past, today, or the
  future. On create, expiration MAY be omitted (treated as none). On full
  replace, System MUST require quantity, unit, and expiration together;
  expiration set to none clears a previously set date; omitting quantity, unit,
  or expiration MUST be rejected as validation failure without changing the
  prior item.
- **FR-005**: System MUST allow organizers to list all PantryItems in the
  household ordered A–Z by linked Ingredient display name (case-insensitive) and
  open any PantryItem by identity to view its current fields. Search and filter
  are out of scope for v1.
- **FR-006**: System MUST allow organizers to update a PantryItem via a full
  replace of mutable fields (quantity, unit, and expiration — all required on
  every replace), including clearing expiration to none; Ingredient identity
  MUST NOT change on update (requests that attempt to change Ingredient linkage
  MUST be rejected); last successful replace wins; partial updates are not
  supported.
- **FR-007**: System MUST allow organizers to permanently remove a PantryItem
  from household inventory after confirmation; removed items MUST NOT appear in
  subsequent list or detail views.
- **FR-008**: System MUST reuse the same predefined unit catalog as Recipes and
  Ingredients for PantryItem units (no pantry-only unit list). Unit equality
  with the Ingredient default is required by FR-001 / FR-002.
- **FR-009**: System MUST enforce field and inventory limits: quantity must be a
  finite number greater than zero, rounded/stored to at most 3 decimal places;
  max 500 PantryItems per household; adds beyond the cap MUST be rejected with a
  clear limit explanation.
- **FR-010**: System MUST preserve PantryItem identity across quantity/unit/
  expiration changes and MUST scope pantry inventory per household; one
  household’s pantry MUST NOT be visible or editable as another household’s.
- **FR-011**: System MUST NOT automatically add, adjust, or remove PantryItems
  from grocery-list completion or meal cooking in this feature; those behaviors
  belong to the UpdatePantry workflow and related future features.
- **FR-012**: System MUST NOT generate grocery lists or perform pantry
  subtraction during this feature; BuildGroceryList remains a separate consumer
  of PantryItem stock.
- **FR-013**: System MUST show linked Ingredient display name with each
  PantryItem on list and detail so organizers can recognize stock without
  memorizing identifiers.
- **FR-014**: System MUST leave expired or soon-to-expire items in inventory
  until the organizer removes or updates them; this feature MUST NOT silently
  delete items based on expiration date.
- **FR-015**: System MUST block deletion of a household catalog Ingredient while
  any PantryItem in that household references it; the organizer MUST remove the
  pantry item first. Ingredient delete MUST NOT cascade-remove pantry stock and
  MUST NOT leave orphan pantry rows.

### Key Entities *(include if feature involves data)*

- **PantryItem**: Household stock of one Ingredient. Has stable identity,
  required link to a household catalog Ingredient (unique per household),
  positive quantity (decimal allowed; ≤3 decimal places, same as Recipes), unit
  equal to the Ingredient’s default unit, and optional expiration date. Used
  later by grocery subtraction and UpdatePantry consumers.
- **Ingredient (dependency)**: Household catalog food identity from the
  Ingredients feature; required reference for every PantryItem.
- **Unit (catalog entry)**: Reused from Recipes/Ingredients — predefined
  measurement unit with stable identifier and display label.
- **Household (dependency)**: Scopes pantry inventory (same household boundary as
  FamilyMember, Recipe, and Ingredient libraries).

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences, dietary restrictions, and dislikes MUST be honored by later
  planning consumers; this feature does not attach preference logic to pantry
  stock.
- Grocery lists MUST derive from approved meals and subtract pantry inventory;
  this feature supplies the stock quantities those workflows will subtract.
- Pantry items MUST track quantity and unit and MAY track expiration (honored
  here); automatic pantry updates after confirmed grocery completion belong to
  UpdatePantry and are out of delivery scope for this feature.
- AI-generated recipes MUST share the curated schema and pass dietary
  validation; this feature does not change recipe schema or AI generation.
- Non-AI behavior MUST remain deterministic.
- Business logic for PantryItem MUST live in Speckit specs/workflows only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Organizers can add a pantry item with Ingredient, quantity, and
  unit, leave and return, and see 100% of those fields (plus optional
  expiration when set) persisted as saved.
- **SC-002**: Organizers can complete recording a typical pantry item
  (Ingredient, quantity, unit, optional expiration) in under 2 minutes without
  assistance.
- **SC-003**: Invalid creates/updates (missing Ingredient, duplicate Ingredient
  stock, non-positive quantity, unknown unit, unit not equal to Ingredient
  default, omitted quantity/unit/expiration on full replace, over inventory
  limits) are rejected 100% of the time with a clear explanation, and no partial
  pantry entry is written.
- **SC-004**: In usability checks, at least 90% of organizers can locate a known
  pantry item in an inventory of 20+ items (using the A–Z Ingredient name order)
  and open its detail on the first attempt.
- **SC-005**: Duplicate pantry stock for the same Ingredient within a household
  is prevented 100% of the time.
- **SC-006**: After confirmed removal, the pantry item is absent from inventory
  list and detail on 100% of subsequent views.
- **SC-007**: Reopening a pantry item shows the same quantity, unit, and
  expiration (or cleared expiration) as last successfully saved on 100% of
  checks.

## Assumptions

- Target user is the household organizer (same actor model as Family Member,
  Preference Profile, Recipe, and Ingredient features).
- Pantry inventory is household-scoped, not a shared global stock database.
- Exactly one PantryItem per Ingredient per household in v1 (aggregate on-hand
  quantity). Separate lots for the same Ingredient with different expirations
  are out of scope; organizers keep a single optional expiration on the
  aggregate stock.
- Quantity must be strictly positive and MAY be a decimal; values are
  rounded/stored to at most 3 decimal places (aligned with Recipes). Depleting
  stock means deleting the PantryItem rather than storing zero.
- Pantry unit MUST equal the linked Ingredient’s default unit at create and
  update; other catalog units are rejected. Unit conversion between kinds
  remains out of scope. If an Ingredient’s default unit is later changed,
  existing pantry stock is not auto-converted; the next pantry update must use
  the new default unit.
- Expiration is optional calendar date (day precision) and MAY be past, today,
  or future when set; time-of-day and automatic expired-item purge are out of
  scope.
- Automatic UpdatePantry after grocery confirmation, meal-cook consumption, and
  BuildGroceryList pantry subtraction are out of delivery scope; this feature
  owns manual pantry CRUD only. Those constitution workflows remain mandatory
  follow-on features that MUST consume PantryItem stock (see plan follow-ons).
- Catalog Ingredients must already exist before they can be stocked; creating
  Ingredients inline during pantry add is out of scope.
- Changing which Ingredient a PantryItem points to after create is out of scope;
  organizers remove and re-add.
- Household pantry cap is 500 entries (aligned with the Ingredient catalog cap).
- Concurrent edits use last-successful-full-replace semantics (aligned with
  Preference Profile, Recipe, and Ingredient). On full replace, quantity, unit,
  and expiration are all required; expiration none clears expiration; omitting
  any of those fields is a validation failure (no partial update).
- Catalog browse is A–Z by Ingredient display name only; filter by expiration,
  category, or low stock is deferred beyond v1.
- SC-002 and SC-004 are manual UX outcomes (time-to-add and findability demos),
  not automated harness gates.
- Multi-household auth and switching remain as established by earlier features;
  this feature only enforces per-household pantry isolation.
- Ingredient catalog delete is blocked while pantry stock references that
  Ingredient; organizers remove the PantryItem first, then delete the
  Ingredient. This feature owns the pantry-side rule; Ingredient delete must
  honor the same block when pantry exists.
