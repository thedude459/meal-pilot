# Feature Specification: Preference Profiles

**Feature Branch**: `002-preference-profile`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "PreferenceProfile"

## Clarifications

### Session 2026-07-12

- Q: How should a “conflict” between a free-text like and a dietary restriction be detected? → A: Deferred to meal matching — PreferenceProfile does not resolve like↔restriction pairs; consumers always apply hard exclusions when scoring/filtering meals
- Q: What limits apply to free-text like/dislike labels? → A: Per-label max 40 characters; max 50 likes and 50 dislikes per profile
- Q: Does the order of likes and dislikes matter, and must it be preserved? → A: Preserve relative order from the saved list after normalization
- Q: If two preference saves for the same member overlap, what should happen? → A: Last successful full replace wins; no merge of concurrent edits
- Q: If the same dietary restriction is submitted more than once in one save, what should happen? → A: Collapse duplicate restriction IDs on save; keep first-seen order

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit a member's preference profile (Priority: P1)

A household organizer opens a family member's preference profile and records
likes, dislikes, and dietary restrictions so meal planning can honor that
person's tastes and constraints.

**Why this priority**: PreferenceProfile is the constitution's primary input for
preference-aware planning. Capturing and updating it is the minimum viable
value of this feature.

**Independent Test**: On an existing family member, set at least one free-text
like, one free-text dislike, and one predefined dietary restriction; save;
reopen and confirm all values persist exactly as saved.

**Acceptance Scenarios**:

1. **Given** an existing family member with an empty preference profile,
   **When** the organizer adds free-text likes and dislikes and selects dietary
   restrictions from the predefined catalog, **Then** those values are saved on
   that member's PreferenceProfile.
2. **Given** a member with existing preferences, **When** the organizer updates
   or clears entries and saves, **Then** the profile reflects only the current
   saved values.
3. **Given** the organizer is editing dietary restrictions, **When** they attempt
   a value not on the predefined catalog, **Then** the system rejects it and
   leaves the saved profile unchanged.
4. **Given** the organizer submits the same dietary restriction ID more than
   once in one save, **When** the update succeeds, **Then** the profile stores
   that restriction once, in first-seen order among restrictions.
5. **Given** the organizer enters blank or whitespace-only like/dislike labels,
   **When** they save, **Then** those empty labels are discarded and do not
   appear on the saved profile.
6. **Given** the organizer submits a like or dislike longer than 40 characters,
   or more than 50 likes or 50 dislikes after normalization, **When** they save,
   **Then** the system rejects the update and leaves the saved profile unchanged.

---

### User Story 2 - View preference profiles and the restriction catalog (Priority: P2)

The organizer views a member's current preferences and the available dietary
restriction choices so they can confirm what will drive meal planning.

**Why this priority**: Visibility builds trust that preferences are recorded
correctly before planning runs; secondary to the ability to save.

**Independent Test**: Open a member with known saved preferences and confirm
likes, dislikes, and restriction labels match; open the dietary restriction
catalog and confirm it lists only predefined options with human-readable labels.

**Acceptance Scenarios**:

1. **Given** a member with a saved PreferenceProfile, **When** the organizer
   views that member's preferences, **Then** likes, dislikes, and dietary
   restrictions are shown as currently saved.
2. **Given** the organizer is preparing to edit restrictions, **When** they view
   the dietary restriction catalog, **Then** they see the predefined options
   with clear labels (not opaque codes alone).
3. **Given** a member with an empty PreferenceProfile, **When** the organizer
   views preferences, **Then** the profile is shown as empty (no likes, dislikes,
   or restrictions) and is treated as valid.

---

### User Story 3 - Resolve preference conflicts for meal-planning consumers (Priority: P3)

When the same person has overlapping or conflicting preference signals, the
system exposes clear effective preferences so later meal planning can apply
consistent rules without guessing.

**Why this priority**: Conflict rules protect planning quality (Constitution
Principle I) but depend on preferences already being captured.

**Independent Test**: Save a profile where a label appears in both likes and
dislikes; confirm effective likes exclude the overlapping label, dislikes remain
avoidances, and hard restrictions are exposed unchanged for consumers to apply
when matching meals.

**Acceptance Scenarios**:

1. **Given** a PreferenceProfile where the same free-text label (differing only
   by case or surrounding spaces) appears in both likes and dislikes, **When**
   a meal-planning consumer reads effective preferences, **Then** that label is
   treated as a dislike/avoidance and is not treated as a like.
2. **Given** a PreferenceProfile with both likes and dietary restrictions,
   **When** a meal-planning consumer evaluates a meal, **Then** hard
   restrictions always exclude matching meals even if a like would favor them;
   PreferenceProfile does not pair or strip likes against restrictions itself.
3. **Given** duplicate like or dislike labels that differ only by case or
   whitespace, **When** the profile is saved, **Then** duplicates are collapsed
   to a single label (first-seen casing preserved) without losing distinct
   preferences, and remaining labels keep their relative order.
4. **Given** two family members with different PreferenceProfiles, **When**
   either profile is updated, **Then** the other member's profile is unchanged.
5. **Given** likes or dislikes saved in a specific order, **When** the organizer
   views the profile again, **Then** labels appear in the same relative order
   as after the last successful save (after normalization).

---

### Edge Cases

- Empty PreferenceProfiles are valid; members may exist before preferences are
  known.
- Preference updates apply only on explicit save; discarding unsaved edits is a
  client/UI concern.
- Concurrent or overlapping saves use last successful full replace wins; there
  is no merge of concurrent edits and no optimistic version check in v1.
- Whitespace-only labels are ignored on save.
- A like or dislike label longer than 40 characters (after trim) causes the
  entire preference update to be rejected.
- More than 50 likes or 50 dislikes after blank removal and duplicate collapse
  causes the entire preference update to be rejected.
- Case-insensitive duplicate labels within likes or within dislikes are
  collapsed on save; remaining labels keep relative order; order is for
  display/stability only and is not a ranking signal for meal planning.
- Case-insensitive overlap between likes and dislikes: dislike wins for
  meal-planning consumers.
- Like↔restriction “conflicts” are not detected or rewritten inside
  PreferenceProfile; when consumers match meals, hard restrictions always win
  over likes that would favor the same meal.
- Dietary restrictions are hard exclusions; dislikes are soft avoidances that
  may influence ranking but do not force exclusion by themselves.
- Unknown dietary restriction identifiers are rejected; the last successfully
  saved profile remains unchanged.
- Duplicate dietary restriction IDs in one save are collapsed to a single entry,
  preserving first-seen order among restrictions.
- PreferenceProfiles are never created or deleted independently of FamilyMember
  lifecycle (creation and permanent delete are owned by Family Member Profiles).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a household organizer to view the PreferenceProfile
  for an existing FamilyMember.
- **FR-002**: System MUST allow the organizer to replace a member's
  PreferenceProfile with likes and dislikes as free-text labels and dietary
  restrictions selected only from a predefined catalog. Each successful save is
  a full replace; when saves overlap, the last successful replace wins (no merge
  of concurrent edits).
- **FR-003**: System MUST persist PreferenceProfile data so it survives session
  restarts.
- **FR-004**: System MUST reject dietary restriction values that are not on the
  predefined catalog and MUST NOT partially apply an invalid update.
- **FR-005**: System MUST treat an empty PreferenceProfile (no likes, dislikes,
  or restrictions) as valid.
- **FR-006**: System MUST keep PreferenceProfiles isolated per FamilyMember;
  edits to one member MUST NOT change another.
- **FR-007**: System MUST expose the predefined dietary restriction catalog with
  stable identifiers and human-readable labels for selection and display.
- **FR-008**: On save, System MUST ignore blank or whitespace-only like/dislike
  labels and MUST collapse case-insensitive duplicate labels within likes and
  within dislikes, preserving first-seen casing and the relative order of
  remaining labels. Saved order is for stable display only and MUST NOT be
  treated as preference strength for meal planning.
- **FR-009**: On save, System MUST collapse duplicate dietary restriction IDs to
  a single entry, preserving first-seen order among restrictions.
- **FR-010**: System MUST reject a preference update when any like or dislike
  label exceeds 40 characters after trim, or when likes or dislikes exceed 50
  items each after blank removal and duplicate collapse; the prior saved profile
  MUST remain unchanged.
- **FR-011**: When the same free-text label (case-insensitive) appears in both
  likes and dislikes, meal-planning consumers MUST treat it as a dislike
  (avoidance), not as a like.
- **FR-012**: PreferenceProfile MUST NOT resolve or strip free-text likes against
  dietary restrictions. Meal-planning consumers MUST apply hard restrictions when
  matching meals so restricted meals are excluded even if a like would favor them.
- **FR-013**: Dietary restrictions on a PreferenceProfile MUST be exposed as hard
  exclusions (`hardRestrictions`) for meal-planning consumers. Those consumers
  MUST ensure restricted items or meals never appear in generated plans for that
  member. Soft avoidance belongs in dislikes. This feature does not generate plans.
- **FR-014**: System MUST expose consumer-facing effective preferences
  (`effectiveLikes` after dislike-wins, `effectiveDislikes`, and
  `hardRestrictions`) derived from a saved PreferenceProfile without mutating
  the stored lists. Effective likes MUST NOT be filtered against dietary
  restrictions within this feature.
- **FR-015**: System MUST NOT require organizers to create or delete
  PreferenceProfiles separately from FamilyMember create/remove; lifecycle remains
  owned by the Family Member Profiles feature.
- **FR-016**: System MUST associate each FamilyMember with exactly one
  PreferenceProfile (1:1).

### Key Entities *(include if feature involves data)*

- **PreferenceProfile**: Structured preferences belonging to a single
  FamilyMember. Likes and dislikes are free-text labels; dietary restrictions
  are values drawn from a predefined catalog. Used by later meal-planning
  features via effective preference views.
- **FamilyMember**: Existing household person (from Family Member Profiles) that
  owns exactly one PreferenceProfile; this feature does not redefine roster
  create/rename/remove rules.
- **DietaryRestriction (catalog entry)**: A predefined restriction option with a
  stable identifier and display label selectable on a PreferenceProfile.

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences, dietary restrictions, and dislikes MUST be honored by downstream
  meal planning that consumes PreferenceProfiles. This feature exposes
  `hardRestrictions` and effective likes/dislikes; meal-planning consumers MUST
  enforce hard exclusions at meal-matching time (even when a like would favor
  the meal). When the same label appears in likes and dislikes, dislike wins for
  planning consumers.
- Non-AI behavior for view and update of preference profiles MUST remain
  deterministic.
- Business logic for PreferenceProfile MUST live in Speckit specs/workflows only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Organizers can open a member's preference profile, record at least
  one like, one dislike, and one dietary restriction, and confirm persistence
  after leaving and returning, with 100% of saved fields retained in
  verification checks.
- **SC-002**: 95% of organizers complete a preference edit (add or change at
  least one field and save) in under 2 minutes without assistance.
- **SC-003**: Invalid dietary restriction attempts and over-limit like/dislike
  updates (label >40 characters or >50 likes/dislikes after normalization) are
  blocked 100% of the time in verification checks, with the prior saved profile
  unchanged.
- **SC-004**: Preference edits on one member never appear on another member in
  cross-member verification checks.
- **SC-005**: For profiles with like/dislike label overlaps, effective likes
  exclude the overlapping labels in 100% of sampled cases; hard restrictions
  remain available unchanged for consumers to apply at meal-matching time.
- **SC-006**: Empty profiles remain viewable and editable; organizers can add
  the first preference later without creating a separate profile record.
- **SC-007**: After a successful save, reopening the profile shows likes and
  dislikes in the same relative order as stored after normalization.

## Assumptions

- Family Member Profiles (`001-family-member`) already provides FamilyMember
  roster management and auto-creates an empty PreferenceProfile on member
  create; permanent member delete cascades PreferenceProfile removal.
- Capture model is hybrid: free-text likes/dislikes; dietary restrictions from a
  predefined catalog (aligned with Family Member Profiles clarifications).
- A single household organizer manages preferences; per-member login accounts
  are out of scope.
- Preference intensity/ranking scales, separate allergy fields, and cuisine
  affinity scores are out of scope; allergies are expressed as dietary
  restrictions or dislikes.
- Free-text like/dislike labels are capped at 40 characters each; each profile
  may have at most 50 likes and 50 dislikes after normalization (FR-010).
- Like/dislike list order is preserved after normalization for stable display;
  order is not a ranking or intensity signal for meal planning.
- Household-wide aggregation of multiple members' preferences for a single weekly
  plan is owned by future meal-planning features; this feature exposes
  per-member stored and effective preferences only.
- Like↔restriction precedence is applied by meal-planning consumers when
  matching meals, not by rewriting stored or effective likes inside
  PreferenceProfile.
- Meal plan generation, grocery lists, pantry updates, and recipe validation are
  consumers of PreferenceProfile rules and are not delivered by this feature.
- Delete confirmation prompts and unsaved-edit discard UX are client/UI only.
- Concurrent preference saves are last-write-wins on full replace; optimistic
  locking and field-level merge are out of scope for v1.
- Duplicate dietary restriction IDs are collapsed on save (first-seen order),
  consistent with like/dislike duplicate handling.
