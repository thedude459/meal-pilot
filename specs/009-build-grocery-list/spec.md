# Feature Specification: Build Grocery List

**Feature Branch**: `009-build-grocery-list`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "BuildGroceryList"

## Clarifications

### Session 2026-07-12

- Q: When a checked grocery line’s quantity is below the computed net need, what should BuildGroceryList do? → A: Leave the checked line unchanged; report the remaining shortfall (net need minus checked quantity) so the organizer can fix it manually (no duplicate line, no auto-edit of checked items)
- Q: On rebuild, what happens to unchecked grocery lines for Ingredients not in the current approved-meal need? → A: Remove only unchecked lines for Ingredients that appear in this build’s merged set with net need zero (e.g. fully pantry-covered); leave unchecked manual adds whose Ingredient never appears in this build’s merged set from approved meals
- Q: Should expired PantryItems reduce grocery need? → A: No — ignore expired pantry quantity (do not subtract it); missing expiration counts as available
- Q: If a name matches but every contributing line has a unit conflict, is the Ingredient in the merged set? → A: Yes — in merged set with net need 0 from successful lines; remove unchecked line if present; report unit conflicts (do not hard-fail the build)
- Q: Which calendar defines “expiration before today”? → A: UTC calendar date (aligned with Monday week-start)
- Post-analyze remediation (2026-07-12): US4 pantry-cover scenarios merged; constitution export + UpdatePantry remain **deferred, not waived** (follow-on specs required before claiming full Principle III/IV); quickstart plan discovery uses generate `.plan.id`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a pantry-aware grocery list from approved meals (Priority: P1)

A household organizer runs BuildGroceryList for a week that already has
approved meals on a WeeklyPlan. The system extracts ingredients from those
approved Recipes, merges quantities for the same catalog Ingredient, subtracts
what the pantry already covers, and writes the net shopping need onto the
household grocery list so the organizer can shop without manually copying
recipes.

**Why this priority**: BuildGroceryList is the constitution’s Automatic Grocery
Generation workflow. Without deriving the list from approved meals and
subtracting pantry stock, organizers rebuild shopping lists by hand and the
meal-to-shopping loop fails.

**Independent Test**: With a WeeklyPlan that has at least two approved slots
whose Recipes share at least one overlapping ingredient name that matches the
catalog, plus pantry stock that partially covers one ingredient, run
BuildGroceryList; confirm merged net quantities appear as GroceryItems grouped
by shopping category, fully covered ingredients are absent, and pending or
rejected slots contributed nothing.

**Acceptance Scenarios**:

1. **Given** a WeeklyPlan for a Monday week-start with one or more approved
   meal slots and matching catalog Ingredients for those Recipe ingredient
   names, **When** the organizer runs BuildGroceryList for that week, **Then**
   the household grocery list reflects the merged net need from approved meals
   only (pending, rejected, and empty slots are ignored).
2. **Given** the same Ingredient appears in multiple approved Recipes, **When**
   BuildGroceryList runs, **Then** quantities for that Ingredient are merged
   into a single grocery line (no duplicate Ingredient lines).
3. **Given** pantry stock for an Ingredient covers part of the merged need and
   that stock is not expired (or has no expiration), **When** BuildGroceryList
   runs, **Then** the grocery quantity equals the shortfall only (merged need
   minus available pantry quantity in the same unit).
4. **Given** pantry stock fully covers an Ingredient’s merged need and that
   stock is not expired (or has no expiration), **When** BuildGroceryList runs,
   **Then** that Ingredient is not added as a new grocery line and is not left
   as an unchecked “buy” line from this build.
5. **Given** pantry stock exists but its expiration date is before today (UTC
   calendar date), **When** BuildGroceryList runs, **Then** that quantity is
   not subtracted (treated as unavailable); need is computed as if that pantry
   stock were absent.
6. **Given** the organizer omits the week, references an unknown week/plan, or
   the week has zero approved meals, **When** they request BuildGroceryList,
   **Then** the system rejects the request with a clear explanation and does
   not change the grocery list.

---

### User Story 2 - Review the built list and keep shopping progress (Priority: P1)

After a build, the organizer opens the household grocery list, sees items
grouped by shopping category with net quantities, and can continue checking
items off while shopping. Re-running BuildGroceryList refreshes unchecked needs
from the current approved meals without wiping items already marked purchased.

**Why this priority**: A generated list is only useful if it is reviewable in
the existing grocery browse/check-off experience and safe to regenerate as the
plan changes. Equally critical to first-time generation for a usable shopping
loop.

**Independent Test**: Build a list, check one item as purchased, change an
approved meal (or re-approve differently) and rebuild; confirm the checked item
remains, unchecked lines reflect the new net need, and category grouping still
follows the Ingredient catalog order.

**Acceptance Scenarios**:

1. **Given** a successful BuildGroceryList run, **When** the organizer opens the
   grocery list, **Then** lines are grouped by Ingredient shopping category
   (or "Other"), in the predefined category catalog order with "Other" last,
   and within each group ordered A–Z by Ingredient display name, each showing
   quantity, unit, and checked status.
2. **Given** some grocery lines are already checked, **When** the organizer
   re-runs BuildGroceryList for the same week, **Then** checked lines are left
   unchanged (quantity, unit, and checked status preserved) and are not
   duplicated.
3. **Given** a checked grocery line whose quantity is less than the computed
   net need for that Ingredient, **When** BuildGroceryList runs, **Then** the
   checked line is left unchanged and the build report includes the remaining
   shortfall (net need minus checked quantity) for that Ingredient.
4. **Given** unchecked grocery lines exist before a rebuild, **When**
   BuildGroceryList runs, **Then** unchecked lines for Ingredients in this
   build’s merged set are refreshed (updated to net need, or removed when net
   need is zero / fully pantry-covered), checked lines stay as they were, and
   unchecked lines for Ingredients that never appear in this build’s merged
   set (e.g. manual adds) are left unchanged.
5. **Given** a built list, **When** the organizer uses existing grocery check
   toggle, quantity edit, or remove actions, **Then** those GroceryItem
   behaviors continue to work as defined by the Grocery Items feature.

---

### User Story 3 - Understand unmatched or skipped ingredients (Priority: P2)

When a Recipe ingredient line cannot be matched to the household Ingredient
catalog (or cannot be merged because its unit does not match the catalog
Ingredient’s default unit), the build still completes for matched ingredients
and reports what was skipped so the organizer can fix aliases, catalog entries,
or recipe units and rebuild.

**Why this priority**: Free-text Recipe lines and catalog Ingredients may not
align perfectly; transparency keeps trust without blocking the whole list.
Secondary to producing a usable list from matched ingredients.

**Independent Test**: Approve a meal whose Recipe includes one catalog-matched
ingredient and one free-text name with no catalog/alias match; run build;
confirm the matched item appears (subject to pantry rules) and the report
lists the unmatched name without failing the whole build.

**Acceptance Scenarios**:

1. **Given** approved Recipes with a mix of matchable and unmatchable ingredient
   names, **When** BuildGroceryList runs, **Then** matchable ingredients are
   written to the grocery list per net-need rules and unmatchable lines are
   omitted from auto-written lines.
2. **Given** a Recipe ingredient quantity uses a unit that is not the matched
   catalog Ingredient’s default unit, **When** BuildGroceryList runs, **Then**
   that line is omitted from auto-written grocery quantities and appears in the
   build report as a unit conflict (no silent unit conversion). If every
   contributing line for that Ingredient is unit-conflicted, the Ingredient
   still counts as in this build’s merged set with net need zero: any unchecked
   grocery line for it is removed, and conflicts are reported without failing
   the whole build.
3. **Given** a build completed with skips, **When** the organizer reviews the
   result, **Then** they can see which ingredient lines were unmatched or
   skipped and why, alongside the successful grocery list outcome.
4. **Given** every approved-meal ingredient line is unmatched or unit-conflicted
   and pantry does not change that outcome, **When** BuildGroceryList runs,
   **Then** the system still completes successfully with an empty net-need
   write set and a report that explains nothing could be auto-listed (it does
   not hard-fail solely because of skips).

---

### User Story 4 - Rebuild after plan changes (Priority: P3)

After the organizer approves additional meals, rejects prior approvals, or
updates pantry stock, they re-run BuildGroceryList for the same week and get an
updated net shopping list without starting from a blank mental inventory.

**Why this priority**: Weekly plans iterate; rebuild keeps the list aligned.
Depends on core build and checked-item preservation already working.

**Independent Test**: Build once from two approved days; approve a third day
with new ingredients; rebuild; confirm new net needs appear and prior checked
progress remains.

**Acceptance Scenarios**:

1. **Given** a prior build and newly approved slots on the same WeeklyPlan,
   **When** the organizer rebuilds, **Then** newly required Ingredients appear
   (or existing unchecked quantities increase) according to merged need minus
   pantry.
2. **Given** a meal is no longer approved and its Ingredients are not needed by
   other approved meals (Ingredient absent from this build’s merged set),
   **When** the organizer rebuilds, **Then** an unchecked grocery line for that
   Ingredient is left unchanged (same as a manual add outside the plan); checked
   lines for those Ingredients also remain.
3. **Given** an Ingredient remains in this build’s merged set but available
   pantry now fully covers its merged need (e.g. pantry quantity increased),
   **When** the organizer rebuilds, **Then** any unchecked grocery line for that
   Ingredient is removed and it is not written as an unchecked buy line.

---

### Edge Cases

- Only **approved** WeeklyPlan slots contribute ingredients. Pending, rejected,
  and empty days never contribute.
- Zero approved slots → request rejected; grocery list unchanged.
- Unknown week-start / missing WeeklyPlan → rejected; grocery list unchanged.
- Week-start must be a Monday (same rule as WeeklyPlan / GenerateWeeklyMeals).
- Recipe ingredient names match catalog Ingredients via case-insensitive
  equality on normalized display name or any alias (same normalization as the
  Ingredients feature). No fuzzy/partial match beyond that.
- Multiple Recipe lines matching the same catalog Ingredient merge by summing
  quantities only when a line uses the Ingredient’s current default unit;
  unit-conflicting lines are skipped and reported. An Ingredient that matched by
  name remains in this build’s merged set even if every contributing line was
  unit-conflicted (effective successful merge quantity 0 / net need 0 after
  pantry), so unchecked grocery lines for it are removed per rebuild rules.
- Pantry subtraction uses the PantryItem for that Ingredient when present and
  not expired; missing pantry means subtract zero. A PantryItem with an
  expiration date before today (UTC calendar date, same day boundary convention
  as Monday week-start) MUST NOT reduce need (treated as unavailable). A
  PantryItem with no expiration MUST be treated as available. Comparison is in
  the Ingredient default unit only.
- Net need ≤ 0 for an Ingredient that appears in this build’s merged set
  (matched from approved meals) → do not create or refresh an unchecked grocery
  line; remove an existing unchecked line for that Ingredient on rebuild.
  Unchecked lines for Ingredients that do **not** appear in this build’s merged
  set (e.g. manual adds, or leftovers from meals no longer approved) MUST be
  left unchanged.
- Checked grocery lines are never modified or deleted by BuildGroceryList
  (quantity, unit, and checked status preserved). Because only one grocery line
  may exist per Ingredient, a checked line blocks create/update for that
  Ingredient. When checked quantity is below net need, the build report MUST
  include the remaining shortfall (net need minus checked quantity); when
  checked quantity already meets or exceeds net need, the report notes a
  checked skip with zero remaining shortfall (or omits shortfall).
- Household grocery cap (500) still applies; if writing net needs would exceed
  the cap, the build fails without partial writes beyond what atomic success
  requires (no half-applied rebuild of unchecked lines).
- BuildGroceryList does not modify PantryItem quantities, WeeklyPlan slots,
  Recipes, or Ingredient catalog entries.
- BuildGroceryList does not run UpdatePantry and does not export to external
  services in this feature’s v1 delivery (export remains a mandatory follow-on
  constitution capability).
- Manual GroceryItem create/update/delete/check remains available; rebuild
  semantics above still apply on the next BuildGroceryList run.
- Concurrent rebuilds: last successful rebuild wins for unchecked lines.
- Quantities follow the same positive decimal / ≤3 decimal places rules as
  GroceryItem and PantryItem.
- Recipe servings metadata does not rescale ingredient quantities in v1; each
  approved slot contributes Recipe ingredient quantities as stored.
- Household isolation: one household’s approved meals and pantry MUST NOT
  affect another household’s grocery list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a BuildGroceryList action that, given a
  Monday week-start (or equivalent WeeklyPlan identity for that week), reads
  all **approved** meal slots on that household WeeklyPlan and produces grocery
  list updates from those meals only.
- **FR-002**: System MUST reject BuildGroceryList when week-start is missing,
  not a Monday, the WeeklyPlan is unknown, or there are zero approved slots;
  invalid requests MUST NOT change the grocery list.
- **FR-003**: System MUST extract ingredient lines from each approved slot’s
  Recipe and map each line to a household catalog Ingredient by
  case-insensitive match on normalized display name or alias.
- **FR-004**: System MUST merge quantities for the same matched Ingredient
  across all contributing approved meals by summing quantities from lines whose
  units equal that Ingredient’s default unit (unit-conflicting lines are omitted
  from the sum and reported); System MUST treat a name-matched Ingredient as
  present in this build’s merged set even when every contributing line was
  unit-conflicted (successful merge quantity 0); System MUST NOT create more
  than one GroceryItem per Ingredient per household.
- **FR-005**: System MUST subtract available PantryItem quantity for each
  matched Ingredient (same default unit) from the merged need, where available
  means the PantryItem has no expiration or an expiration date of today or
  later on the UTC calendar (aligned with Monday week-start); System MUST NOT
  subtract quantities from PantryItems whose expiration is before today UTC;
  System MUST NOT include an Ingredient on the auto-written unchecked need set
  when available pantry covers the full merged need.
- **FR-006**: System MUST write net needs to the household GroceryItem list by:
  creating unchecked lines for new needed Ingredients; updating quantity (and
  retaining unchecked status) on existing unchecked lines for Ingredients in
  this build’s merged set; removing unchecked lines only for Ingredients that
  appear in this build’s merged set with net need zero; leaving unchecked lines
  for Ingredients outside this build’s merged set unchanged; leaving all
  checked GroceryItems unchanged and never duplicating them.
- **FR-007**: System MUST report unmatched Recipe ingredient names, unit
  conflicts (Recipe unit ≠ Ingredient default unit), and skips due to an
  existing checked GroceryItem, without failing the whole build solely because
  some lines were skipped. When a checked line’s quantity is below net need,
  the report MUST include the remaining shortfall (net need minus checked
  quantity) for that Ingredient so the organizer can adjust manually.
- **FR-008**: System MUST keep grocery list presentation grouped and ordered
  per the Grocery Items feature (category catalog order, "Other" last, A–Z
  within groups).
- **FR-009**: System MUST remain deterministic for BuildGroceryList (same
  approved meals, Recipes, pantry, and grocery state → same net list and
  report).
- **FR-010**: System MUST NOT modify pantry stock, meal approval state, or
  Recipes as part of BuildGroceryList; UpdatePantry remains a separate
  workflow after shopping confirmation.
- **FR-011**: System MUST NOT export grocery lists to external services in this
  feature’s v1 delivery; export remains a constitution-required follow-on
  (deferred, not waived).
- **FR-012**: System MUST enforce household isolation and the existing
  household GroceryItem cap (500); builds that cannot apply unchecked updates
  without exceeding the cap MUST fail without leaving a partially rebuilt
  unchecked set.
- **FR-013**: System MUST reuse existing GroceryItem quantity/unit/checked
  rules (positive quantity, ≤3 decimal places, unit = Ingredient default unit,
  checked via dedicated toggle only) for every line it creates or updates.
- **FR-014**: System MUST NOT scale Recipe ingredient quantities by servings (or
  other multipliers) in v1; each approved slot contributes quantities as stored
  on the Recipe.
- **FR-015**: System MUST scope BuildGroceryList to a single week’s WeeklyPlan
  per run (no multi-week merge in v1).

### Key Entities *(include if feature involves data)*

- **GroceryListBuilder (workflow)**: Constitution BuildGroceryList /
  `GroceryListBuilder` service behavior. Not a separate durable document;
  orchestrates extract → merge → pantry subtract → categorize/write → report
  over existing entities.
- **WeeklyPlan / MealSlot (dependency)**: Source of approved meals; only slots
  with status **approved** and a linked Recipe contribute.
- **Recipe (dependency)**: Supplies free-text ingredient lines (name, quantity,
  unit) for approved slots.
- **Ingredient (dependency)**: Catalog identity used for merge, grocery lines,
  pantry subtraction, and shopping-category grouping; matched from Recipe names
  via display name / aliases.
- **PantryItem (dependency)**: On-hand quantity subtracted from merged need when
  present for the matched Ingredient.
- **GroceryItem (dependency / write target)**: Durable shopping-list line
  created, updated, or removed (unchecked only) by the builder; checked lines
  are preserved.
- **BuildReport (result)**: Outcome summary for the organizer: net lines
  written/updated/removed, fully pantry-covered ingredients, unmatched names,
  unit conflicts, checked-line skips, and remaining shortfall when a checked
  line’s quantity is below net need. Not required to be a long-lived entity
  beyond the action response in v1.

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences, dietary restrictions, and dislikes MUST already have been honored
  by planning/approval before this workflow runs; BuildGroceryList does not
  re-filter meals by preference.
- Grocery lists MUST derive from approved meals and subtract pantry inventory —
  this feature delivers that workflow.
- Grocery generation MUST combine ingredients across approved meals, remove
  duplicates, merge quantities, and group by shopping category.
- Grocery list generation MUST NEVER include pantry-covered items unless
  available quantity is insufficient (shortfall only); expired pantry does not
  count as available for this subtraction.
- Export to external services remains mandatory constitution capability but is
  deferred (not waived) from this feature’s v1 delivery.
- UpdatePantry after confirmed shopping remains a separate workflow.
- AI-generated recipes MUST share the curated schema; this feature reads Recipes
  the same way regardless of source and does not create AI Recipes.
- Non-AI behavior MUST remain deterministic.
- Business logic for BuildGroceryList MUST live in Speckit specs/workflows only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Organizers can run BuildGroceryList for a week with approved meals
  and see a grocery list that reflects merged ingredient needs from those meals
  in under 2 minutes (generate + open list).
- **SC-002**: When the same Ingredient appears in multiple approved meals,
  organizers see exactly one grocery line for that Ingredient after a successful
  build (100% of checks).
- **SC-003**: When available (non-expired or unexpiring) pantry fully covers an
  Ingredient’s merged need, that Ingredient does not appear as an unchecked buy
  line after the build (100% of checks).
- **SC-004**: When available pantry partially covers an Ingredient, the
  unchecked grocery quantity equals the shortfall (merged need minus available
  pantry) on 100% of checks (within the shared ≤3 decimal-place quantity rule).
  Expired pantry quantity is never subtracted (100% of checks).
- **SC-005**: Re-running BuildGroceryList leaves every previously checked
  grocery line unchanged on 100% of checks; when checked quantity is below net
  need, the build result includes the remaining shortfall on 100% of those
  cases.
- **SC-006**: Pending and rejected meals never contribute ingredients to the
  built list (100% of checks).
- **SC-007**: Builds with some unmatched or unit-conflicted Recipe lines still
  complete for matched lines, and organizers can identify skipped lines from the
  build result on at least 90% of first-attempt reviews in usability checks.
- **SC-008**: Invalid builds (non-Monday week, missing plan, zero approved
  meals) are rejected 100% of the time with a clear explanation and no grocery
  list changes.
- **SC-009**: After rebuild following approval changes, unchecked lines for
  Ingredients in the new merged set match the new net need on 100% of checks;
  unchecked lines for Ingredients outside that merged set remain unchanged;
  organizers need not clear the entire list manually first.

## Assumptions

- Target user is the household organizer (same actor model as prior features).
- WeeklyPlan, MealSlot approval, Recipe library, Ingredient catalog, PantryItem,
  and GroceryItem CRUD/check-off already exist and are reused; this feature owns
  the BuildGroceryList workflow, not a new parallel shopping-list entity.
- One household, one active grocery list of GroceryItems (no named multi-list
  documents in v1).
- Matching Recipe free-text names to catalog Ingredients uses normalized
  display name and aliases only; auto-creating catalog Ingredients during build
  is out of scope.
- Name match alone places an Ingredient in the merged set; unit-only failures
  still yield merged-set membership with successful quantity 0.
- No unit conversion between different units in v1; mismatches are skipped and
  reported.
- Expired pantry stock (expiration before today UTC) does not reduce grocery
  need; pantry rows with no expiration are fully available for subtraction.
- Servings-based scaling is out of scope for v1.
- Default rebuild semantics: refresh unchecked lines for Ingredients in this
  build’s merged set; remove unchecked lines only when that Ingredient’s net
  need is zero; leave unchecked lines for Ingredients outside the merged set
  (manual adds / non-plan leftovers); preserve checked lines entirely; do not
  auto-delete checked lines when need becomes zero.
- Export to external services (constitution) is deferred, not waived—same
  pattern as AI hybrid deferral in GenerateWeeklyMeals.
- UpdatePantry after shopping confirmation is out of delivery scope.
- Store-specific list layouts, budget filters, and multi-week builds are out of
  scope.
- SC-001 and SC-007 include manual UX outcomes (time-to-build and report
  understandability), not only automated harness gates.
- Multi-household auth/switching remain as established earlier; this feature
  only enforces per-household isolation for read inputs and grocery writes.
