# Feature Specification: Grocery Items

**Feature Branch**: `006-grocery-item`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "GroceryItem"

## Clarifications

### Session 2026-07-12

- Q: When adding a grocery line for an Ingredient that already has a GroceryItem, what should happen? → A: Reject the add; organizer must update quantity on the existing line
- Q: When marking purchased or clearing a check, must organizers full-replace quantity + unit + checked together? → A: Dedicated check toggle changes purchased status alone; full replace is for quantity/unit edits only
- Q: How should shopping category groups be ordered on the list? → A: Predefined catalog order (same as Ingredient shopping-category catalog); "Other" always last
- Q: Inside a category group, how should checked vs unchecked items be ordered? → A: Stay A–Z by Ingredient display name regardless of checked status
- Q: After shopping, can the organizer remove or clear all checked items in one action in v1? → A: No bulk clear in v1; remove grocery items individually only
- Post-analyze remediation (2026-07-12): Create rejects `checked` if present; FR-002 scoped to create/quantity-unit replace (not check toggle); delete “confirmation” is UI-only; FR-005/FR-008 trimmed vs FR-015/FR-001; canonical term `checked` (purchased = synonym)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a grocery line for a catalog ingredient (Priority: P1)

A household organizer adds a measurable amount of a known catalog Ingredient to
the household shopping list (quantity and unit), so the household knows what to
buy and later BuildGroceryList / UpdatePantry workflows have a stable grocery
line identity to generate into or confirm from.

**Why this priority**: Without grocery lines tied to Ingredient identity,
automatic grocery generation and pantry-aware shopping cannot materialize.
Capturing quantity and unit against Ingredient is the minimum viable
GroceryItem foundation.

**Independent Test**: With at least one Ingredient already in the household
catalog, add a grocery item for that ingredient with quantity and unit; reopen
it and confirm ingredient, quantity, unit, shopping category grouping, and
unchecked purchase status persist as saved.

**Acceptance Scenarios**:

1. **Given** a household catalog Ingredient and no grocery line for it, **When**
   the organizer adds a grocery item with a positive quantity (decimal allowed)
   and the Ingredient’s default unit, **Then** the grocery item appears on the
   household list and can be opened with those values intact (quantity stored to
   at most 3 decimal places) and purchase status unchecked.
2. **Given** the organizer is adding a grocery item, **When** they omit the
   ingredient, reference an unknown ingredient, omit quantity, provide a
   non-positive quantity, omit unit, select an unknown unit, select a unit that
   is not the Ingredient’s default unit, or include a checked (purchased) field
   on create, **Then** the system rejects the add and explains what is
   required; no partial grocery item is saved.
3. **Given** the household already has a grocery item for ingredient "Olive
   oil", **When** the organizer tries to add another grocery item for the same
   ingredient, **Then** the system rejects the add and explains that a grocery
   line for that ingredient already exists; the existing grocery item is
   unchanged.
4. **Given** a successfully saved grocery item whose Ingredient has a shopping
   category, **When** the organizer views the list, **Then** the line is grouped
   under that shopping category. **Given** the Ingredient has no shopping
   category, **When** the organizer views the list, **Then** the line is grouped
   under "Other".
5. **Given** a successfully saved grocery item, **When** the organizer views it,
   **Then** it is identifiable as a household grocery line for a specific
   Ingredient (stable grocery identity independent of later quantity or check
   changes).

---

### User Story 2 - Browse and view the shopping list (Priority: P2)

The organizer browses the household grocery list grouped by shopping category
and opens a grocery item to confirm Ingredient, quantity, unit, and whether it
has been checked off before shopping or relying on the list.

**Why this priority**: Visibility and category grouping are how organizers use
the list in-store; secondary to the ability to record lines.

**Independent Test**: With at least two known grocery items in different
shopping categories (or one categorized and one uncategorized), open the list
and one detail view and confirm grouping, ingredient identity, quantities,
units, and check status match what was saved.

**Acceptance Scenarios**:

1. **Given** a household with multiple grocery items spanning more than one
   shopping category, **When** the organizer opens the grocery list, **Then**
   items are grouped by shopping category (Ingredient category when set,
   otherwise "Other"), category groups appear in the predefined Ingredient
   shopping-category catalog order with "Other" last when present, and within
   each group lines are ordered A–Z by Ingredient display name
   (case-insensitive) regardless of checked status, each distinguishable as a
   separate entry with quantity, unit, and check status.
2. **Given** a saved grocery item, **When** the organizer opens it, **Then**
   they see Ingredient identity and display name, quantity, unit, effective
   shopping category, and whether it is checked as purchased.
3. **Given** an empty grocery list, **When** the organizer opens it, **Then**
   they see an empty list and can still start an add for a catalog Ingredient.

---

### User Story 3 - Update quantity or remove a grocery line (Priority: P2)

The organizer corrects quantity or unit for an existing grocery item, or removes
a line that is no longer needed, so the shopping list stays accurate.

**Why this priority**: List hygiene keeps shopping trustworthy; depends on
grocery items already existing.

**Independent Test**: Edit one grocery item’s quantity and unit, save, reopen and
confirm; then permanently delete a different grocery item and confirm it no
longer appears.

**Acceptance Scenarios**:

1. **Given** a saved grocery item, **When** the organizer updates quantity or
   unit and saves, **Then** the list shows the updated values on reopen and
   checked status is unchanged.
2. **Given** the organizer submits an invalid edit (non-positive quantity,
   unknown unit, unit that is not the Ingredient’s default unit, omits
   quantity or unit on full replace, or a change that would leave the line
   invalid), **When** they save, **Then** the system rejects the update and
   leaves the prior grocery item unchanged.
3. **Given** a saved grocery item, **When** the organizer permanently deletes it
   (any UI confirmation is outside this feature’s API), **Then** the grocery
   item is removed from the household list and no longer appears in list or
   detail views.
4. **Given** a saved grocery item, **When** the organizer attempts to change
   which Ingredient it refers to, **Then** the system rejects that change;
   Ingredient linkage is fixed at create time (remove and re-add if a different
   Ingredient is needed).
5. **Given** a saved grocery item, **When** the organizer full-replaces it and
   omits quantity or unit, **Then** the system rejects the save as validation
   failure and the prior grocery item remains unchanged.
6. **Given** a saved grocery item, **When** the organizer full-replaces it and
   includes a new or same Ingredient identity in the replace payload, **Then**
   the system rejects the save as validation failure and the prior grocery item
   remains unchanged.
7. **Given** a saved grocery item, **When** the organizer full-replaces quantity
   and unit and also includes a checked-status field in that replace, **Then**
   the system rejects the save as validation failure; checked status is changed
   only via the dedicated check toggle.

---

### User Story 4 - Check off purchased items (Priority: P2)

While shopping, the organizer marks grocery items as purchased (or clears a
mistaken check) so progress is visible and later UpdatePantry confirmation can
consume which lines were bought.

**Why this priority**: Check-off is core shopping-list behavior and a prerequisite
signal for confirmed pantry updates; still depends on lines existing.

**Independent Test**: Check one grocery item, reopen list/detail and confirm it
shows purchased; uncheck it and confirm it returns to unchecked; confirm
quantity and Ingredient are unchanged by check toggles.

**Acceptance Scenarios**:

1. **Given** an unchecked grocery item, **When** the organizer uses the check
   toggle to mark it purchased (without resending quantity or unit), **Then**
   the list and detail show it as checked and quantity, unit, and Ingredient
   remain unchanged.
2. **Given** a checked grocery item, **When** the organizer uses the check
   toggle to clear the check, **Then** it shows as unchecked again without
   changing quantity or unit.
3. **Given** a mix of checked and unchecked items in the same category group,
   **When** the organizer opens the list, **Then** check status is visible on
   every line without removing checked items, and relative A–Z order by
   Ingredient name within the group is unchanged by which items are checked.
4. **Given** a grocery item, **When** the organizer changes checked status only
   via the dedicated toggle, **Then** that status persists on reopen until
   toggled again or the item is removed.

---

### Edge Cases

- Creates and quantity/unit replaces require a positive quantity that MAY be a
  decimal; quantities are rounded/stored to at most 3 decimal places (same rule
  as Recipes and PantryItems). Zero or negative quantities are rejected without
  partial save. Removing a need to buy is represented by deleting the grocery
  item, not by storing zero. The dedicated check toggle does not send quantity
  or unit and is not subject to those omit rules.
- Create requests MUST NOT include a checked field; if `checked` is present on
  create, the request is rejected with no row saved. New lines always start
  unchecked.
- Only one grocery item may exist per Ingredient per household; duplicate
  creates for the same Ingredient are rejected (merge identity for later
  BuildGroceryList).
- Unknown Ingredient IDs or unit IDs are rejected; a unit that is not the linked
  Ingredient’s current default unit is rejected. The prior grocery item (on
  quantity/unit replace) or no new item (on create) remains. If the
  Ingredient’s default unit later changes, existing grocery rows are not
  auto-converted; subsequent quantity/unit replaces MUST use the Ingredient’s
  current default unit.
- Shopping category for display/grouping is derived from the linked Ingredient’s
  shopping category when set; otherwise the line groups under "Other". Category
  groups appear in predefined Ingredient shopping-category catalog order with
  "Other" last. This feature does not store a separate category override on the
  grocery item.
- Ingredient linkage cannot change after create; organizers remove and re-add
  to list a different Ingredient. Replace requests that include an Ingredient
  identity field MUST be rejected (not silently ignored).
- On full replace, quantity and unit are both required; omitting either is
  rejected without changing prior state. Full replace MUST NOT accept or change
  checked status (include checked → reject). Checked status changes only via
  the dedicated check toggle. Partial quantity/unit updates are not supported.
- Checked items remain on the list until the organizer removes them
  individually; this feature does not offer bulk remove/uncheck of all checked
  lines and does not auto-update pantry after shopping.
- Grocery list size limits: adds beyond the household grocery cap are rejected
  without creating a partial entry.
- Concurrent full replaces on the same grocery item: last successful save wins;
  no field-level merge.
- Deleting a catalog Ingredient that still has a GroceryItem in the household is
  blocked until that grocery item is removed; no silent cascade or orphan lines.
  Renaming an Ingredient or changing its shopping category does not change the
  grocery linkage (identity is stable); list grouping reflects the Ingredient’s
  current category on read.
- This feature does not generate lists from WeeklyPlan/approved meals, subtract
  pantry stock during generation, export to external services, or run
  UpdatePantry after confirmation; those workflows consume GroceryItem later.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a household organizer to create a GroceryItem for
  a household catalog Ingredient with a positive quantity (decimal allowed,
  greater than zero) and a unit that MUST be the linked Ingredient’s default
  unit from the predefined unit catalog shared with Recipes, Ingredients, and
  PantryItems. Quantities MUST be rounded/stored to at most 3 decimal places
  (same rule as Recipes). New GroceryItems MUST start unchecked. Create
  requests MUST NOT include a checked field; if checked is present on create,
  System MUST reject the request without saving a row.
- **FR-002**: System MUST reject creates and quantity/unit full replaces that
  omit a valid Ingredient reference (create), omit a positive quantity, omit a
  valid unit, reference an unknown Ingredient or unit, or use a unit other than
  the linked Ingredient’s default unit; invalid requests MUST NOT partially
  save. This requirement does NOT apply to the dedicated check-toggle path
  (FR-004), which correctly omits quantity and unit.
- **FR-003**: System MUST enforce at most one GroceryItem per Ingredient per
  household; a create that would duplicate an existing Ingredient’s grocery line
  MUST be rejected without changing the existing item.
- **FR-004**: System MUST provide a dedicated check toggle that allows
  organizers to mark a GroceryItem as checked (purchased) or clear that mark
  (unchecked) without resending quantity or unit. Checked status MUST NOT
  remove the item from the list or change quantity, unit, or Ingredient
  linkage. Checked status MUST NOT be changed via quantity/unit full replace.
- **FR-005**: System MUST allow organizers to list all household GroceryItems
  (grouped and ordered per FR-015) and open any GroceryItem by identity to view
  its current fields. Search and filter beyond category grouping are out of
  scope for v1.
- **FR-006**: System MUST allow organizers to update a GroceryItem via a full
  replace of quantity and unit (both required on every replace); full replace
  MUST leave checked status unchanged and MUST reject requests that include a
  checked-status field; Ingredient identity MUST NOT change on update (requests
  that attempt to change Ingredient linkage MUST be rejected); last successful
  replace wins; partial quantity/unit updates are not supported.
- **FR-007**: System MUST allow organizers to permanently remove a GroceryItem
  from the household list; removed items MUST NOT appear in subsequent list or
  detail views. Any confirm-before-delete prompt is a client/UI concern and is
  not a separate API of this feature. System MUST NOT provide bulk remove or
  bulk uncheck of all checked GroceryItems in this feature.
- **FR-008**: System MUST reuse the same predefined unit catalog as Recipes,
  Ingredients, and PantryItems for GroceryItem units (no grocery-only unit
  list).
- **FR-009**: System MUST enforce field and list limits: quantity must be a
  finite number greater than zero, rounded/stored to at most 3 decimal places;
  max 500 GroceryItems per household; adds beyond the cap MUST be rejected with
  a clear limit explanation.
- **FR-010**: System MUST preserve GroceryItem identity across quantity/unit/
  checked changes and MUST scope the grocery list per household; one
  household’s grocery list MUST NOT be visible or editable as another
  household’s.
- **FR-011**: System MUST NOT automatically create, merge, adjust, or remove
  GroceryItems from WeeklyPlan approval, pantry subtraction, grocery-list
  completion, or meal cooking in this feature; those behaviors belong to
  BuildGroceryList, UpdatePantry, and related future features.
- **FR-012**: System MUST NOT export grocery lists to external services in this
  feature; export remains a separate constitution capability for a later
  feature.
- **FR-013**: System MUST show linked Ingredient display name and effective
  shopping category with each GroceryItem on list and detail so organizers can
  recognize and group lines without memorizing identifiers.
- **FR-014**: System MUST block deletion of a household catalog Ingredient while
  any GroceryItem in that household references it; the organizer MUST remove the
  grocery item first. Ingredient delete MUST NOT cascade-remove grocery lines
  and MUST NOT leave orphan grocery rows.
- **FR-015**: System MUST derive list grouping category from the linked
  Ingredient’s current shopping category (or "Other" when unset); organizers
  MUST NOT set a separate category override on the GroceryItem in this feature.
  Category group order MUST follow the predefined Ingredient shopping-category
  catalog order, with "Other" last. Within each group, sort MUST remain A–Z by
  Ingredient display name and MUST NOT reorder lines based on checked status.

### Key Entities *(include if feature involves data)*

- **GroceryItem**: A household shopping-list line for one Ingredient. Has stable
  identity, required link to a household catalog Ingredient (unique per
  household), positive quantity (decimal allowed; ≤3 decimal places, same as
  Recipes), unit equal to the Ingredient’s default unit, and **checked** status
  (canonical field name; “purchased” is a synonym in user-facing copy).
  Effective shopping category is derived from the Ingredient for grouping. Used
  later by BuildGroceryList generation/merge consumers and UpdatePantry
  confirmation.
- **Ingredient (dependency)**: Household catalog food identity from the
  Ingredients feature; required reference for every GroceryItem; supplies
  display name and optional shopping category for grouping.
- **ShoppingCategory (catalog entry)**: Predefined grocery grouping from the
  Ingredients feature; used for list display grouping via the linked Ingredient.
- **Unit (catalog entry)**: Reused from Recipes/Ingredients/PantryItems —
  predefined measurement unit with stable identifier and display label.
- **Household (dependency)**: Scopes the grocery list (same household boundary as
  FamilyMember, Recipe, Ingredient, and PantryItem libraries).

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences, dietary restrictions, and dislikes MUST be honored by later
  planning consumers; this feature does not attach preference logic to grocery
  lines.
- Grocery lists MUST derive from approved meals and subtract pantry inventory;
  this feature supplies the GroceryItem line identity, quantity, unit, category
  grouping, and checked status those workflows will generate into and confirm
  from. Automatic generation and pantry subtraction are out of delivery scope
  here but remain mandatory follow-on constitution behavior.
- Pantry items MUST track quantity and unit and MAY track expiration; this
  feature does not modify PantryItem stock (UpdatePantry remains separate).
- AI-generated recipes MUST share the curated schema and pass dietary
  validation; this feature does not change recipe schema or AI generation.
- Non-AI behavior MUST remain deterministic.
- Business logic for GroceryItem MUST live in Speckit specs/workflows only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Organizers can add a grocery item with Ingredient, quantity, and
  unit, leave and return, and see 100% of those fields (plus unchecked status
  and effective shopping category) persisted as saved.
- **SC-002**: Organizers can complete adding a typical grocery item (Ingredient,
  quantity, unit) in under 2 minutes without assistance.
- **SC-003**: Invalid creates/quantity-unit replaces (missing Ingredient,
  duplicate Ingredient line, non-positive quantity, unknown unit, unit not equal
  to Ingredient default, omitted quantity/unit on full replace, checked field
  included on create or full replace, over list limits) are rejected 100% of the
  time with a clear explanation, and no partial grocery entry is written.
- **SC-004**: In usability checks, at least 90% of organizers can locate a known
  grocery item in a list of 20+ items (using catalog-ordered category groups
  with "Other" last and A–Z Ingredient name order within groups) and open its
  detail on the first attempt.
- **SC-005**: Duplicate grocery lines for the same Ingredient within a household
  are prevented 100% of the time.
- **SC-006**: After confirmed removal, the grocery item is absent from list and
  detail on 100% of subsequent views.
- **SC-007**: Reopening a grocery item shows the same quantity, unit, and
  checked status as last successfully saved on 100% of checks.
- **SC-008**: Organizers can mark an item purchased and see that checked state
  on list and detail on 100% of subsequent views until cleared or the item is
  removed.

## Assumptions

- Target user is the household organizer (same actor model as Family Member,
  Preference Profile, Recipe, Ingredient, and PantryItem features).
- The grocery list is household-scoped: a single active shopping list of
  GroceryItems per household (no named/multiple list documents in v1).
- Exactly one GroceryItem per Ingredient per household in v1 (merged line
  identity aligned with constitution duplicate-merge). Separate lines for the
  same Ingredient are out of scope. A manual add for an Ingredient that already
  has a grocery line is rejected (not quantity-merged); increasing quantity is
  an explicit update. Automatic quantity merge across meals belongs to
  BuildGroceryList later.
- Quantity must be strictly positive and MAY be a decimal; values are
  rounded/stored to at most 3 decimal places (aligned with Recipes and
  PantryItems). Removing a buy need means deleting the GroceryItem rather than
  storing zero.
- Grocery unit MUST equal the linked Ingredient’s default unit at create and
  update; other catalog units are rejected. Unit conversion between kinds
  remains out of scope. If an Ingredient’s default unit is later changed,
  existing grocery lines are not auto-converted; the next grocery update must
  use the new default unit.
- Shopping category for grouping is always derived from the linked Ingredient
  (or "Other"); per-line category override is out of scope.
- Canonical field name is **checked** (boolean); “purchased” means the same
  thing in organizer-facing language. New items start unchecked and MUST reject
  create payloads that include `checked`. Checked items stay on the list until
  removed one at a time. Checked status changes only via a dedicated toggle
  (not via quantity/unit full replace). Bulk remove-all-checked and
  bulk-uncheck are out of scope for v1. Delete confirmation prompts are UI-only.
- BuildGroceryList (extract/merge from approved WeeklyPlan meals, subtract
  pantry, auto-create/update GroceryItems), UpdatePantry after confirmed
  completion, and export to external services are out of delivery scope; this
  feature owns manual grocery-line CRUD and check-off only. Those constitution
  workflows remain mandatory follow-on features that MUST consume GroceryItem.
- Catalog Ingredients must already exist before they can be added to the list;
  creating Ingredients inline during grocery add is out of scope.
- Changing which Ingredient a GroceryItem points to after create is out of
  scope; organizers remove and re-add.
- Household grocery list cap is 500 entries (aligned with Ingredient and
  PantryItem caps).
- Concurrent quantity/unit edits use last-successful-full-replace semantics
  (aligned with Preference Profile, Recipe, Ingredient, and PantryItem). On
  full replace, quantity and unit are both required; omitting either is a
  validation failure; including checked status on full replace is a validation
  failure. Concurrent check toggles: last successful toggle wins.
- List browse is category-grouped in Ingredient shopping-category catalog order
  with "Other" last, and A–Z by Ingredient display name within groups regardless
  of checked status; text search/filter is deferred beyond v1.
- SC-002 and SC-004 are manual UX outcomes (time-to-add and findability demos),
  not automated harness gates.
- Multi-household auth and switching remain as established by earlier features;
  this feature only enforces per-household grocery list isolation.
- Ingredient catalog delete is blocked while a grocery line references that
  Ingredient; organizers remove the GroceryItem first, then delete the
  Ingredient. This feature owns the grocery-side rule; Ingredient delete must
  honor the same block when grocery lines exist (in addition to any pantry
  block from the PantryItem feature).
- WeeklyPlan does not yet exist as a delivered feature; this GroceryItem entity
  is the durable shopping-list foundation those planning workflows will write
  into later.
