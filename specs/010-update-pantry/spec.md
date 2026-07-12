# Feature Specification: Update Pantry

**Feature Branch**: `010-update-pantry`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "UpdatePantry"

## Clarifications

### Session 2026-07-12

- Q: When expired cleanup is on and a checked purchase targets an Ingredient with already-expired pantry stock, what should happen? → A: Remove expired items first, then apply purchases (restock creates/updates fresh stock)
- Q: May UpdatePantry run with expired cleanup on and zero checked grocery lines (cleanup-only)? → A: Always require ≥1 checked line; reject cleanup-only confirms
- Q: After a successful confirm, what should the organizer receive as the result? → A: Return an apply report: per-line create vs increase, quantities, and expired removals when cleanup ran
- Q: When checking the pantry cap of 500, should capacity be evaluated after expired cleanup removals? → A: Evaluate cap after cleanup removals, then apply creates/increases
- Q: Should preview accept the same optional expired-cleanup flag and project cleanup + post-cleanup apply outcomes? → A: Preview accepts the cleanup flag and projects removals + post-cleanup apply results

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirm shopping and restock the pantry (Priority: P1)

After shopping, a household organizer confirms that checked grocery lines were
purchased. The system applies those purchased quantities to household pantry
stock (creating stock where none existed, increasing quantity where stock
already exists) so the next grocery build subtracts what was bought instead of
asking the household to buy it again.

**Why this priority**: UpdatePantry is the constitution’s Pantry-Aware Inventory
completion step. Without applying confirmed purchases to pantry stock, shopping
progress never becomes inventory and grocery lists keep over-buying.

**Independent Test**: With at least two checked GroceryItems (one Ingredient
already in the pantry, one not), run UpdatePantry confirmation; confirm pantry
quantities increased or were created for those Ingredients, and the applied
grocery lines are no longer on the list.

**Acceptance Scenarios**:

1. **Given** one or more checked GroceryItems and an empty or partial pantry,
   **When** the organizer confirms UpdatePantry, **Then** each checked line’s
   Ingredient receives pantry stock equal to the purchased grocery quantity
   (new PantryItem when none existed; existing quantity increased by the
   grocery quantity when stock already existed), using the Ingredient’s default
   unit.
2. **Given** a checked GroceryItem whose Ingredient already has pantry stock,
   **When** UpdatePantry runs, **Then** the pantry quantity becomes prior pantry
   quantity plus grocery quantity (rounded/stored to at most 3 decimal places)
   and Ingredient linkage and unit remain the Ingredient’s default unit.
3. **Given** a successful UpdatePantry confirmation, **When** the organizer
   opens the grocery list, **Then** every GroceryItem that was applied is gone
   (removed), and unchecked GroceryItems remain unchanged.
4. **Given** no checked GroceryItems (whether or not expired cleanup is
   requested), **When** the organizer requests UpdatePantry, **Then** the
   system rejects the request with a clear explanation and changes neither
   pantry nor grocery list.
5. **Given** a successful confirmation, **When** the organizer views pantry
   list/detail for the affected Ingredients, **Then** quantities and units
   match the post-update stock and remain available to later BuildGroceryList
   subtraction.
6. **Given** a successful confirmation, **When** the confirm completes,
   **Then** the organizer receives an apply report listing each applied
   Ingredient with create-vs-increase, current pantry quantity before apply
   (`currentQuantity`, or none), grocery quantity applied, resulting pantry
   quantity, and (when cleanup ran) any expired PantryItems removed.

---

### User Story 2 - Preview what confirmation will change (Priority: P2)

Before committing, the organizer can preview which checked grocery lines will
be applied, whether each will create or increase pantry stock, and the
resulting pantry quantity — so they can uncheck mistakes before confirming.

**Why this priority**: Confirmation mutates inventory; a preview reduces
accidental overstock and builds trust. Secondary to the ability to apply
updates.

**Independent Test**: With a mix of checked and unchecked grocery lines and
known pantry stock (including at least one expired item), request an
UpdatePantry preview with and without the expired-cleanup flag; confirm the
preview lists only checked lines with create-vs-increase and resulting
quantities (reflecting cleanup-then-apply when the flag is on), projects
expired removals when requested, and that preview alone does not change pantry
or grocery data.

**Acceptance Scenarios**:

1. **Given** checked and unchecked grocery lines, **When** the organizer
   requests an UpdatePantry preview, **Then** the preview includes only checked
   lines, each with Ingredient identity/display name, grocery quantity and
   unit, current pantry quantity after any projected cleanup (`currentQuantity`,
   or none), and resulting pantry quantity after apply (using cleanup-then-apply
   ordering when the expired-cleanup flag / `removeExpired` is on).
2. **Given** expired pantry items and the organizer requests preview with
   expired cleanup enabled, **When** preview completes, **Then** the preview
   lists those expired items as projected removals and purchase lines reflect
   pantry state after those removals (e.g. create fresh stock for a previously
   expired Ingredient).
3. **Given** a preview request, **When** it completes, **Then** pantry and
   grocery data are unchanged (preview is read-only).
4. **Given** no checked GroceryItems, **When** the organizer requests a
   preview, **Then** `applied` is empty (nothing to purchase-apply). When the
   expired-cleanup flag is on, the preview MAY still list projected expired
   removals; pantry and grocery data remain unchanged.

---

### User Story 3 - Optionally clear expired pantry stock on confirm (Priority: P3)

During confirmation, the organizer may choose to also remove pantry items whose
expiration date is before today so inventory stays realistic after restocking.

**Why this priority**: Constitution allows optional expired-item removal as part
of UpdatePantry; useful hygiene but not required for restocking purchased
items.

**Independent Test**: With at least one expired PantryItem and one non-expired
(or no-expiration) PantryItem, confirm UpdatePantry with expired cleanup
enabled; confirm only expired items are removed and purchased stock still
applies.

**Acceptance Scenarios**:

1. **Given** pantry items with expiration before today (UTC calendar date) and
   the organizer enables expired cleanup on confirm, **When** UpdatePantry
   succeeds, **Then** those expired PantryItems are removed first and
   non-expired / no-expiration items remain (aside from later quantity changes
   from purchases).
2. **Given** a checked GroceryItem whose Ingredient has expired pantry stock
   and expired cleanup is enabled, **When** UpdatePantry succeeds, **Then**
   the expired PantryItem is removed before purchase apply, and the purchase
   creates fresh pantry stock (expiration unset) rather than being discarded
   by cleanup.
3. **Given** expired pantry items and expired cleanup is not enabled (default),
   **When** UpdatePantry succeeds, **Then** expired items remain in inventory
   unchanged by the cleanup step (purchase apply still runs for checked
   groceries, increasing existing expired stock if present).
4. **Given** a PantryItem with no expiration or expiration today or in the
   future, **When** expired cleanup runs, **Then** that item is not removed by
   cleanup.

---

### Edge Cases

- UpdatePantry applies only currently checked GroceryItems at confirmation
  time; unchecked lines are never applied and are never removed by this
  workflow.
- Apply is atomic: if any checked line cannot be applied (unknown Ingredient,
  grocery unit not equal to Ingredient default unit, pantry create would exceed
  the household pantry cap of 500 **after** accounting for expired cleanup
  removals when that flag is on, or resulting quantity would be invalid), the
  entire confirmation fails, pantry and grocery list remain unchanged, and the
  organizer receives a clear explanation. Unknown Ingredient on a checked line
  is a validation failure for the whole confirm (no partial apply).
- Quantities use the same rules as PantryItem / GroceryItem: positive decimals,
  rounded/stored to at most 3 decimal places. Adding grocery quantity to pantry
  quantity MUST produce a finite positive result within those rules.
- Units on applied grocery lines MUST equal the Ingredient’s current default
  unit (same rule as PantryItem create/replace). Mismatched units cause the
  whole confirmation to fail without partial apply.
- When creating a new PantryItem from a purchase, expiration is left unset
  (none). This workflow does not invent expiration dates from grocery lines.
- When increasing existing pantry stock, existing expiration (if any) is left
  unchanged.
- After a successful apply, applied GroceryItems are permanently removed so a
  second confirmation cannot double-count the same purchase. Unchecked lines
  remain.
- Concurrent confirmations: last successful full apply wins; no merge of
  partial results across failed attempts.
- Preview never mutates pantry or grocery data. Preview MUST accept the same
  optional expired-cleanup flag as confirm and project removals plus
  post-cleanup create-vs-increase results when that flag is on.
- Expired cleanup uses UTC calendar date “before today,” aligned with
  BuildGroceryList expiration handling. Missing expiration is not treated as
  expired. When cleanup is enabled, System MUST remove expired PantryItems
  before applying purchases so a restock of an expired Ingredient creates
  fresh stock instead of being deleted by cleanup.
- This feature does not decrement pantry for cooking meals, convert units,
  merge multi-lot stock, rebuild grocery lists, or export groceries.
- Manual pantry create/edit/remove remains available via the Pantry Items
  feature; UpdatePantry is the confirmation workflow on top of checked
  groceries.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an UpdatePantry confirmation action that
  applies all currently checked household GroceryItems to pantry inventory in
  one atomic operation after explicit organizer confirmation.
- **FR-002**: For each checked GroceryItem, System MUST add its quantity to
  household PantryItem stock for the same Ingredient: create a PantryItem when
  none exists; increase quantity when one exists. Unit MUST be the Ingredient’s
  default unit. Quantities MUST be rounded/stored to at most 3 decimal places.
- **FR-003**: System MUST leave unchecked GroceryItems unchanged (not applied,
  not removed) during UpdatePantry.
- **FR-004**: After a successful confirmation, System MUST permanently remove
  every GroceryItem that was applied so the same purchase cannot be applied
  twice.
- **FR-005**: System MUST reject confirmation when there are zero checked
  GroceryItems, without changing pantry or grocery data — including when the
  expired-cleanup flag is on (cleanup-only confirms are not allowed; expired
  stock without a purchase apply is removed via Pantry Items instead).
- **FR-006**: System MUST reject the entire confirmation without partial apply
  when any checked line fails validation (unknown Ingredient, unit not equal to
  Ingredient default, resulting pantry quantity invalid) or when creating new
  PantryItems would exceed the household pantry cap of 500. Cap evaluation MUST
  use pantry size after expired cleanup removals when that flag is on (cleanup
  can free slots for creates in the same confirmation); when cleanup is off,
  evaluate against the current pantry size.
- **FR-007**: System MUST provide a read-only UpdatePantry preview of checked
  lines showing Ingredient identity/display name, grocery quantity and unit,
  current pantry quantity after any projected cleanup (or none), and resulting
  pantry quantity. Each applied/preview line MUST expose `currentQuantity`
  (null when no pantry row remains for that Ingredient after projected cleanup)
  alongside create-vs-increase action and resulting quantity. Preview MUST
  accept the same optional expired-cleanup flag as confirmation (API field
  `removeExpired`, default off): when on, preview MUST project expired removals
  and compute resulting create-vs-increase quantities using cleanup-then-apply
  ordering; when off, preview MUST project apply against current pantry only.
  Preview MUST NOT mutate pantry or grocery data.
- **FR-008**: On confirmation, System MUST allow an optional expired-cleanup
  flag (API field `removeExpired`, default off). When enabled, System MUST
  remove PantryItems whose expiration date is before today (UTC calendar date)
  **before** applying purchases, within the same atomic confirmation; items
  with no expiration or expiration today/future MUST NOT be removed by cleanup.
  A checked purchase for an Ingredient whose expired stock was just removed
  MUST create fresh pantry stock (expiration unset) rather than being lost to
  cleanup. (Cleanup-only confirms remain forbidden per FR-005.)
- **FR-009**: When creating pantry stock from a purchase, System MUST leave
  expiration unset. When increasing existing stock, System MUST preserve the
  existing expiration value.
- **FR-010**: System MUST NOT decrement pantry for meal cooking, rebuild
  grocery lists, export groceries, convert units, or invent multi-lot stock in
  this feature.
- **FR-011**: System MUST scope UpdatePantry to the household’s grocery list and
  pantry; one household’s confirmation MUST NOT affect another’s inventory or
  list.
- **FR-012**: System MUST remain deterministic for this workflow (no AI
  generation path).
- **FR-013**: On successful confirmation, System MUST return an apply report
  that includes each applied Ingredient (identity/display name), whether pantry
  stock was created or increased, current pantry quantity before the purchase
  apply for that line (`currentQuantity`, null if none after cleanup), grocery
  quantity applied, resulting pantry quantity and unit, and — when expired
  cleanup ran — each removed expired PantryItem (Ingredient identity/display
  name). Failed confirmations MUST NOT return a successful apply report.

### Key Entities *(include if feature involves data)*

- **UpdatePantry confirmation**: Organizer-triggered workflow that consumes
  checked GroceryItems and produces updated PantryItem stock (and optionally
  removes expired PantryItems), returning an apply report of what changed.
- **UpdatePantry apply report**: Outcome summary of a successful confirmation —
  per applied line (create vs increase, quantities) and optional expired
  removals.
- **UpdatePantry preview**: Read-only summary of what confirmation would apply
  for currently checked grocery lines, including optional projected expired
  removals when the cleanup flag is set.
- **GroceryItem (dependency)**: Household shopping line with quantity, unit,
  Ingredient link, and checked status; checked lines are the purchase signal.
- **PantryItem (dependency)**: Household stock of one Ingredient; created or
  quantity-increased by this workflow.
- **Ingredient (dependency)**: Catalog identity and default unit used for both
  grocery and pantry stock.
- **Household (dependency)**: Scopes grocery list and pantry inventory.

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences, dietary restrictions, and dislikes MUST be honored by planning
  consumers; this workflow does not re-rank meals or alter preferences.
- Grocery lists MUST derive from approved meals and subtract pantry inventory
  (BuildGroceryList); this workflow updates pantry after shopping so later
  builds subtract purchased stock.
- After grocery list completion with user confirmation, pantry updates MUST
  occur automatically via this UpdatePantry workflow (apply purchased items,
  adjust quantities, optionally remove expired items).
- AI-generated recipes MUST share the curated schema and pass dietary
  validation; this feature does not change recipe schema or AI generation.
- Non-AI behavior MUST remain deterministic.
- Business logic for UpdatePantry MUST live in Speckit specs/workflows only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After confirmation with N checked grocery lines (N ≥ 1), 100% of
  those Ingredients show pantry stock reflecting prior pantry quantity plus
  purchased quantity (or new stock equal to purchased quantity), 100% of those
  grocery lines are absent from subsequent list views, and the apply report
  lists all N applied lines with correct create-vs-increase and quantities.
- **SC-002**: Organizers can complete preview-then-confirm for a typical set of
  checked items (up to 20 lines) in under 2 minutes without assistance.
- **SC-003**: Invalid confirmations (zero checked items including cleanup-only
  requests, unit/Ingredient failures, pantry cap exceeded) are rejected 100% of
  the time with a clear explanation and zero partial pantry or grocery
  mutations.
- **SC-004**: Preview matches the pantry outcome of a subsequent successful
  confirm for the same checked set and the same expired-cleanup flag 100% of
  the time when no intervening edits occur (including projected expired
  removals when cleanup is enabled).
- **SC-005**: With expired cleanup enabled, 100% of pantry items expired before
  today (UTC) are removed before purchases apply, and 100% of non-expired /
  no-expiration items remain (aside from purchase quantity changes). A purchase
  for a previously expired Ingredient results in fresh pantry stock 100% of the
  time (not discarded by cleanup).
- **SC-006**: Unchecked grocery lines remain present with identical quantity,
  unit, and checked status after 100% of successful confirmations.
- **SC-007**: A second confirmation immediately after a successful apply with no
  new checks is rejected with `UPDATE_PANTRY_NO_CHECKED` 100% of the time —
  purchases are not double-counted.

## Assumptions

- Target user is the household organizer (same actor model as Grocery Items and
  Pantry Items).
- “User confirmation” means an explicit UpdatePantry confirm action, not an
  automatic side effect of marking a grocery line checked.
- All currently checked grocery lines in the household are applied together;
  per-line or partial subset confirmation (beyond unchecking before confirm) is
  out of scope for v1.
- Successful apply removes applied GroceryItems (rather than leaving them
  checked or adding a separate “already stocked” flag) to prevent double-count
  and keep the shopping list focused on remaining needs. Confirm returns an
  apply report (create vs increase, quantities, optional expired removals)
  similar in purpose to BuildGroceryList’s build report.
- Preview is available but not required before confirm; organizers MAY confirm
  directly. Preview accepts the same optional expired-cleanup flag and projects
  the same cleanup-then-apply outcomes as confirm.
- Expired cleanup is opt-in per confirmation (default off) to avoid surprising
  deletions. The API request field name is `removeExpired` (boolean); prose may
  say “expired-cleanup flag.” When enabled, cleanup runs before purchase apply
  so restocking an expired Ingredient yields fresh stock instead of a deleted
  purchase. Cleanup-only confirms (zero checked lines) are rejected; organizers
  remove expired stock without shopping via Pantry Items.
- Expiration “before today” uses the UTC calendar date, aligned with
  BuildGroceryList.
- New pantry rows created from purchases have no expiration; organizers set
  expiration later via Pantry Items if needed.
- Unknown Ingredient on a checked grocery line fails the whole confirmation
  (`VALIDATION_ERROR`) with no pantry or grocery mutations.
- Meal-cook pantry decrement, unit conversion, multi-lot stock, grocery rebuild,
  and export remain out of delivery scope.
- Household pantry cap remains 500 PantryItems; confirmation that would create
  stock beyond the cap fails entirely. Cap is evaluated after expired cleanup
  removals when cleanup is enabled for that confirmation.
- Manual PantryItem CRUD from feature 005 remains available and unchanged.
- GroceryItem check toggle and CRUD from feature 006 remain the way organizers
  mark what was purchased before confirming UpdatePantry.
- SC-002 is a manual UX outcome (time-to-confirm demo), not an automated
  harness gate.
- Multi-household auth and switching remain as established by earlier features;
  this feature only enforces per-household isolation for grocery and pantry.
