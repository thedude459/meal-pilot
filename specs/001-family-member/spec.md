# Feature Specification: Family Member Profiles

**Feature Branch**: `001-family-member`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "FamilyMember"

## Clarifications

### Session 2026-07-12

- Q: How should likes, dislikes, and dietary restrictions be captured on a PreferenceProfile? → A: Hybrid — dietary restrictions from a predefined list; likes and dislikes as free-text labels
- Q: When meal planning later consumes a PreferenceProfile, how strict are dietary restrictions? → A: Hard exclusions — restricted items/meals MUST never appear in generated plans for that member
- Q: If the same free-text label appears in both likes and dislikes for one member, which wins? → A: Dislike wins — the label is treated as an avoidance for planning consumers
- Q: What is the maximum number of FamilyMembers allowed in one household? → A: Hard cap of 12 members per household (adds beyond 12 are rejected)
- Q: After the organizer confirms removal of a FamilyMember, what happens to that member and their PreferenceProfile? → A: Permanent delete — member and PreferenceProfile are removed immediately and cannot be restored

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a family member (Priority: P1)

A household organizer adds a person to the household so meal planning can
account for that person's presence and preferences.

**Why this priority**: Without family members on record, preference-aware meal
planning cannot start. This is the minimum viable foundation.

**Independent Test**: Add one family member with a display name and confirm they
appear in the household roster with an empty preference profile ready for
editing.

**Acceptance Scenarios**:

1. **Given** a household with no members, **When** the organizer adds a member
   with a display name, **Then** the member appears in the household roster and
   has an associated preference profile.
2. **Given** a household with existing members, **When** the organizer adds
   another member with a unique display name, **Then** both members remain
   listed and distinguishable.
3. **Given** the organizer is adding a member, **When** they omit the display
   name, **Then** the system rejects the add and explains that a name is
   required.
4. **Given** a household already at 12 members, **When** the organizer tries to
   add another member, **Then** the system rejects the add and explains the
   household member limit.

---

### User Story 2 - Capture preferences, dislikes, and dietary restrictions (Priority: P2)

The organizer records likes, dislikes, and dietary restrictions on a family
member's preference profile so later meal suggestions can honor them.

**Why this priority**: Constitution Principle I requires preferences and
restrictions to drive planning; capturing them is the next value after the
roster exists.

**Independent Test**: Edit one member's preference profile with at least one
free-text like, one free-text dislike, and one predefined dietary restriction,
save, and reopen the profile to confirm all values persist exactly as entered.

**Acceptance Scenarios**:

1. **Given** an existing family member, **When** the organizer adds free-text
   likes and dislikes and selects dietary restrictions from the predefined list,
   **Then** those values are saved on that member's preference profile.
2. **Given** a member with existing preferences, **When** the organizer updates
   or removes an entry, **Then** the profile reflects only the current values
   after save.
3. **Given** two family members, **When** preferences are set differently for
   each, **Then** each member retains their own preference profile without
   cross-contamination.
4. **Given** the organizer is editing dietary restrictions, **When** they try to
   enter a restriction not on the predefined list, **Then** the system does not
   accept it as a dietary restriction (likes/dislikes remain free-text).

---

### User Story 3 - Maintain the household roster (Priority: P3)

The organizer views, renames, and removes family members so the household
roster stays accurate over time.

**Why this priority**: Rosters change (guests leave, names update); maintenance
is required for ongoing correctness but is secondary to create and preferencing.

**Independent Test**: Rename a member and remove a different member; confirm the
roster shows the updated name and no longer includes the removed member.

**Acceptance Scenarios**:

1. **Given** at least one family member, **When** the organizer opens the
   household roster, **Then** all current members are listed with their display
   names.
2. **Given** an existing member, **When** the organizer changes the display
   name to a valid new name, **Then** the roster shows the updated name.
3. **Given** an existing member, **When** the organizer deletes the member
   (after any client-side confirmation), **Then** the member and their
   preference profile are permanently deleted and cannot be restored.

---

### Edge Cases

- Duplicate display names (case-insensitive) within the household are rejected
  per FR-016; the existing member is unchanged.
- Removing the last family member is allowed; the household roster becomes empty
  and meal planning that requires members cannot proceed until at least one is
  added again.
- Empty preference lists are valid; members may exist before likes, dislikes, or
  restrictions are recorded.
- Preference updates are applied only on explicit save (API replace). Discarding
  unsaved edits is a client/UI concern; the server retains the last successfully
  saved PreferenceProfile.
- When likes conflict with dietary restrictions for the same member, dietary
  restrictions take precedence for meal-planning consumers (FR-011).
- Dietary restrictions are hard exclusions for downstream meal planning (FR-013);
  dislikes may influence ranking but do not force exclusion.
- If the same free-text label appears in both likes and dislikes (case-
  insensitive), dislike wins for meal-planning consumers (FR-014).
- Adding beyond the household member cap is rejected per FR-015; existing members
  are unchanged.
- Member removal is permanent; the member and PreferenceProfile cannot be
  restored. Any confirmation prompt is client/UI only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a household organizer to create a FamilyMember
  with a required display name.
- **FR-002**: System MUST associate each FamilyMember with exactly one
  PreferenceProfile.
- **FR-003**: System MUST allow the organizer to record likes and dislikes as
  free-text labels, and dietary restrictions only by selecting from a predefined
  list, on a member's PreferenceProfile.
- **FR-004**: System MUST persist FamilyMember and PreferenceProfile data so
  they survive session restarts.
- **FR-005**: System MUST allow the organizer to view all FamilyMembers in the
  household roster.
- **FR-006**: System MUST allow the organizer to update a FamilyMember display
  name.
- **FR-007**: System MUST allow the organizer to permanently remove a
  FamilyMember; removal MUST immediately delete that member's PreferenceProfile
  and MUST NOT offer restore. Any confirmation prompt is a client/UI concern and
  is out of scope for the API contract.
- **FR-008**: System MUST reject FamilyMember creation or rename when the
  display name is empty or whitespace-only.
- **FR-009**: System MUST keep PreferenceProfiles isolated per FamilyMember
  (edits to one member MUST NOT change another).
- **FR-010**: System MUST treat an empty PreferenceProfile (no likes, dislikes,
  or restrictions) as valid so members can be added before preferences are known.
- **FR-011**: When likes conflict with dietary restrictions for the same member,
  dietary restrictions MUST take precedence for meal-planning consumers of the
  profile.
- **FR-012**: System MUST reject dietary restriction values that are not on the
  predefined restriction list.
- **FR-013**: Dietary restrictions on a PreferenceProfile MUST be treated as hard
  exclusions by meal-planning consumers: restricted items or meals MUST never
  appear in generated plans for that member. Soft avoidance belongs in dislikes.
- **FR-014**: When the same free-text label (case-insensitive) appears in both
  likes and dislikes on a PreferenceProfile, dislikes MUST take precedence for
  meal-planning consumers (treat as avoidance).
- **FR-015**: System MUST enforce a hard maximum of 12 FamilyMembers per
  household; attempts to add beyond that limit MUST be rejected with a clear
  message.
- **FR-016**: System MUST enforce case-insensitive uniqueness of FamilyMember
  display names within a household; duplicate creates or renames MUST be rejected
  with a clear message and leave existing members unchanged.

### Key Entities *(include if feature involves data)*

- **Household**: Singleton household context for v1; owns up to 12 FamilyMembers.
  Multi-household switching is out of scope.
- **FamilyMember**: A person in the household identified primarily by display
  name; owns exactly one PreferenceProfile.
- **PreferenceProfile**: Structured preferences belonging to a single
  FamilyMember; used by later meal-planning features. Likes and dislikes are
  free-text labels; dietary restrictions are values drawn from a predefined
  list.

### Constitution Constraints *(include when feature touches planning, grocery, pantry, or recipes)*

- Preferences and dislikes MUST be honored by downstream meal planning that
  consumes FamilyMember profiles; dietary restrictions MUST be enforced as hard
  exclusions (never suggest restricted meals/items for that member). When the
  same label appears in likes and dislikes, dislike wins for planning consumers.
- Non-AI behavior for create, read, update, and remove of family members MUST
  remain deterministic.
- Business logic for FamilyMember and PreferenceProfile MUST live in Speckit
  specs/workflows only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Organizers can add a family member with a name in under 1 minute.
- **SC-002**: Organizers can record likes, dislikes, and dietary restrictions
  for a member and confirm they persist after leaving and returning to the
  profile, with 100% of saved fields retained in verification checks.
- **SC-003**: 95% of first-time organizers successfully add at least one family
  member and open their preference profile without assistance.
- **SC-004**: After rename or remove, the household roster reflects the change
  on the next view with no stale member shown.
- **SC-005**: Preference edits on one member never appear on another member in
  cross-member verification checks.
- **SC-006**: Attempts to add a 13th household member are blocked (hard cap);
  households at the 12-member cap remain unchanged.

## Assumptions

- A single household context is in scope for this feature; multi-household
  switching is out of scope.
- The "household organizer" is the person managing the app for the family;
  per-member login accounts are out of scope.
- PreferenceProfile is created automatically with the FamilyMember; organizers
  do not create profiles separately.
- Display names must be unique within a household (case-insensitive) per FR-016.
- A household may include at most 12 FamilyMembers; the 13th add MUST be rejected
  (hard cap per FR-015).
- Optional attributes such as age, avatar, relationship label, and allergies as
  a separate field from dietary restrictions are out of scope for this feature
  unless expressed as dietary restrictions or dislikes.
- Meal plan generation, grocery lists, and pantry updates consume FamilyMember
  data later; they are not part of this feature's delivery.
- Removing a family member permanently deletes that member and their
  PreferenceProfile; historical weekly plans already created are not rewritten,
  and only future preference-driven generation uses the updated roster.
- Soft-delete / restore of removed members is out of scope.
- Delete confirmation prompts, if any, are client/UI only (see FR-007).
