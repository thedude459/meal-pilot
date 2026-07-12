# Data Model: Family Member Profiles

**Feature**: `001-family-member` | **Date**: 2026-07-12

## Entities

### Household

Implicit single-household context for v1 (no multi-household switching).

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Singleton row seeded at init |
| createdAt | datetime | Audit |

**Rules**:
- Exactly one active household in the local database for this feature.
- Member cap of 12 is enforced relative to this household.

### FamilyMember

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| householdId | string (UUID) | FK → Household |
| displayName | string | Required; trimmed |
| displayNameKey | string | Normalized unique key (`trim` + lowercase) |
| createdAt | datetime | |
| updatedAt | datetime | |

**Relationships**:
- Belongs to one Household
- Owns exactly one PreferenceProfile (1:1)

**Validation**:
- `displayName` MUST be non-empty after trim (FR-008)
- `displayNameKey` MUST be unique within `householdId` (case-insensitive uniqueness; FR-016)
- Count of members per household MUST be ≤ 12 on create (hard cap; FR-015)
- Create MUST also create an empty PreferenceProfile (FR-002, FR-010)

**Lifecycle**:
- `created` → `active` (only active state exposed in roster)
- `active` → `deleted` via permanent delete (row + profile removed; no restore)

### PreferenceProfile

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| familyMemberId | string (UUID) | FK → FamilyMember, unique (1:1) |
| likes | string[] | Free-text labels; empty allowed |
| dislikes | string[] | Free-text labels; empty allowed |
| dietaryRestrictionIds | string[] | Subset of catalog IDs; empty allowed |
| updatedAt | datetime | |

**Validation**:
- Every `dietaryRestrictionIds` entry MUST exist in the DietaryRestriction catalog (FR-012)
- Duplicate labels within `likes` or within `dislikes` SHOULD be collapsed case-insensitively on save
- Empty arrays are valid (FR-010)
- Profiles are isolated per member (FR-009)

**Consumer resolution (pure helpers; do not mutate stored lists)**:
1. `hardRestrictions` = dietaryRestrictionIds (hard exclusions for planning; FR-013)
2. If a like label matches a dislike label (case-insensitive), treat as dislike for consumers (FR-014)
3. If a like conflicts with a hard restriction semantic for planning, restriction wins (FR-011)
4. Stored likes/dislikes remain as the organizer entered them

### DietaryRestriction (catalog)

| Field | Type | Notes |
|-------|------|-------|
| id | string | Stable slug, e.g. `gluten_free` |
| label | string | Human-readable, e.g. "Gluten-free" |

**Initial catalog**:
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

## State Transitions

```text
[Create Member]
  → validate name + household count < 12
  → insert FamilyMember + empty PreferenceProfile
  → roster includes member

[Update Name]
  → validate non-empty + unique displayNameKey
  → update displayName / displayNameKey

[Update Preferences]
  → validate restriction IDs ∈ catalog
  → replace likes / dislikes / dietaryRestrictionIds
  → cancel without save leaves prior row unchanged

[Delete Member]
  → confirm
  → delete PreferenceProfile + FamilyMember permanently
  → no restore path
```

## Indexes / Constraints

- UNIQUE (`householdId`, `displayNameKey`) on FamilyMember
- UNIQUE (`familyMemberId`) on PreferenceProfile
- FK cascade: deleting FamilyMember deletes PreferenceProfile

## Out of scope attributes

Age, avatar, relationship label, separate allergy field, soft-delete flags,
multi-household membership.
