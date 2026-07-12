# Data Model: Preference Profiles

**Feature**: `002-preference-profile` | **Date**: 2026-07-12

## Entities

### PreferenceProfile

Owned 1:1 by an existing FamilyMember (`001-family-member`). Not created or
deleted independently.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key (existing) |
| familyMemberId | string (UUID) | FK → FamilyMember, unique (1:1) |
| likes | string[] | Free-text labels; empty allowed; order preserved |
| dislikes | string[] | Free-text labels; empty allowed; order preserved |
| dietaryRestrictionIds | string[] | Subset of catalog IDs; empty allowed; order preserved |
| updatedAt | datetime | Bumped on successful replace |

**Relationships**:
- Belongs to exactly one FamilyMember
- References zero or more DietaryRestriction catalog entries by id

**Validation (on replace)**:
1. Trim like/dislike labels; drop blank/whitespace-only entries
2. Collapse case-insensitive duplicate likes and dislikes separately; keep
   first-seen casing and relative order of remaining labels
3. Reject if any remaining label length > 40 characters (FR-010)
4. Reject if likes length > 50 or dislikes length > 50 after steps 1–2 (FR-010)
5. Every `dietaryRestrictionIds` entry MUST exist in the catalog (FR-004);
   unknown id → reject entire replace
6. Collapse duplicate restriction IDs; keep first-seen order (FR-009)
7. Empty arrays are valid (FR-005)
8. Successful save is a full replace of likes, dislikes, and
   dietaryRestrictionIds (FR-002); last successful replace wins

**Consumer resolution (pure helpers; do not mutate stored lists)**:
1. `hardRestrictions(profile)` = dietaryRestrictionIds (hard exclusions exposed
   for consumers; FR-013)
2. `effectiveDislikes(profile)` = stored dislikes (post-normalization as saved)
3. `effectiveLikes(profile)` = likes whose normalized key is not present in
   dislikes (dislike wins; FR-011)
4. Do **not** filter likes against dietary restrictions inside this module
   (FR-012, FR-014)

### FamilyMember (dependency)

| Field | Role for this feature |
|-------|------------------------|
| id | Lookup key for preference view/replace |
| displayName | Display context only; not modified here |

**Rules owned by `001-family-member`** (not redefined):
- Create member → empty PreferenceProfile
- Delete member → permanent cascade delete of PreferenceProfile
- Roster cap, name uniqueness, rename

### DietaryRestriction (catalog)

| Field | Type | Notes |
|-------|------|-------|
| id | string | Stable slug, e.g. `gluten_free` |
| label | string | Human-readable, e.g. "Gluten-free" |

**Initial catalog** (unchanged from `001-family-member`):

| id | label |
|----|-------|
| vegetarian | Vegetarian |
| vegan | Vegan |
| pescatarian | Pescatarian |
| gluten_free | Gluten-free |
| dairy_free | Dairy-free |
| nut_free | Nut-free |
| shellfish_free | Shellfish-free |
| egg_free | Egg-free |
| soy_free | Soy-free |
| halal | Halal |
| kosher | Kosher |
| low_sodium | Low sodium |

Additive catalog IDs are allowed in future Speckit changes; removals require a
migration/compatibility plan.

## State Transitions

```text
[View Preferences]
  → FamilyMember must exist
  → return stored PreferenceProfile (may be empty)

[View Catalog]
  → return predefined DietaryRestriction entries

[Replace Preferences]
  → FamilyMember must exist
  → normalize likes/dislikes/restrictions
  → validate catalog + length/count limits
  → on failure: leave prior row unchanged
  → on success: full replace; updatedAt = now
  → concurrent replaces: last success wins

[Effective Preferences (read model)]
  → derive from stored profile via pure helpers
  → never persist derived lists

[Member Deleted (001)]
  → PreferenceProfile row removed; no restore
```

## Indexes / Constraints

- UNIQUE (`familyMemberId`) on PreferenceProfile (existing)
- FK cascade: deleting FamilyMember deletes PreferenceProfile (existing)
- Application-enforced catalog membership and label limits (no DB enum required)

## Constants

| Name | Value |
|------|-------|
| MAX_LABEL_LENGTH | 40 |
| MAX_LIKES | 50 |
| MAX_DISLIKES | 50 |

## Out of scope

Household-wide preference aggregation, preference intensity/ranking, separate
allergy entity, soft-delete, optimistic locking, meal matching ontology,
roster create/rename/delete.
