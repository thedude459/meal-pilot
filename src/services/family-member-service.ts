import { and, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { isKnownDietaryRestriction } from "../domain/dietary-restrictions.js";
import {
  assertValidDisplayName,
  MAX_HOUSEHOLD_MEMBERS,
  toDisplayNameKey,
} from "../domain/family-member.js";
import {
  duplicateNameError,
  memberLimitError,
  notFoundError,
  unknownRestrictionError,
} from "../domain/errors.js";
import {
  collapseLabels,
  emptyPreferenceProfile,
  type PreferenceProfile,
} from "../domain/preference-profile.js";
import { DEFAULT_HOUSEHOLD_ID, type AppDatabase } from "../db/client.js";
import { familyMembers, preferenceProfiles } from "../db/schema.js";

export type FamilyMemberDetail = {
  id: string;
  displayName: string;
  preferences: PreferenceProfile;
};

export type FamilyMemberSummary = {
  id: string;
  displayName: string;
};

function parseJsonArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function profileFromRow(row: {
  likesJson: string;
  dislikesJson: string;
  dietaryRestrictionIdsJson: string;
}): PreferenceProfile {
  return {
    likes: parseJsonArray(row.likesJson),
    dislikes: parseJsonArray(row.dislikesJson),
    dietaryRestrictionIds: parseJsonArray(row.dietaryRestrictionIdsJson),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export class FamilyMemberService {
  constructor(
    private readonly db: AppDatabase,
    private readonly householdId = DEFAULT_HOUSEHOLD_ID,
  ) {}

  listFamilyMembers(): { items: FamilyMemberSummary[]; maxMembers: number } {
    const rows = this.db
      .select({
        id: familyMembers.id,
        displayName: familyMembers.displayName,
      })
      .from(familyMembers)
      .where(eq(familyMembers.householdId, this.householdId))
      .all();

    return {
      items: rows.map((r) => ({ id: r.id, displayName: r.displayName })),
      maxMembers: MAX_HOUSEHOLD_MEMBERS,
    };
  }

  createFamilyMember(rawName: string): FamilyMemberDetail {
    const displayName = assertValidDisplayName(rawName);
    const displayNameKey = toDisplayNameKey(displayName);

    const count = this.db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.householdId, this.householdId))
      .all().length;

    if (count >= MAX_HOUSEHOLD_MEMBERS) {
      throw memberLimitError();
    }

    const conflict = this.db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.householdId, this.householdId),
          eq(familyMembers.displayNameKey, displayNameKey),
        ),
      )
      .get();

    if (conflict) {
      throw duplicateNameError();
    }

    const memberId = randomUUID();
    const profileId = randomUUID();
    const ts = nowIso();
    const empty = emptyPreferenceProfile();

    this.db.transaction((tx) => {
      tx.insert(familyMembers)
        .values({
          id: memberId,
          householdId: this.householdId,
          displayName,
          displayNameKey,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      tx.insert(preferenceProfiles)
        .values({
          id: profileId,
          familyMemberId: memberId,
          likesJson: JSON.stringify(empty.likes),
          dislikesJson: JSON.stringify(empty.dislikes),
          dietaryRestrictionIdsJson: JSON.stringify(empty.dietaryRestrictionIds),
          updatedAt: ts,
        })
        .run();
    });

    return {
      id: memberId,
      displayName,
      preferences: empty,
    };
  }

  getFamilyMember(memberId: string): FamilyMemberDetail {
    const member = this.db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.id, memberId))
      .get();

    if (!member || member.householdId !== this.householdId) {
      throw notFoundError();
    }

    const profile = this.db
      .select()
      .from(preferenceProfiles)
      .where(eq(preferenceProfiles.familyMemberId, memberId))
      .get();

    if (!profile) {
      throw notFoundError("Preference profile not found");
    }

    return {
      id: member.id,
      displayName: member.displayName,
      preferences: profileFromRow(profile),
    };
  }

  replacePreferences(
    memberId: string,
    input: { likes: string[]; dislikes: string[]; dietaryRestrictionIds: string[] },
  ): PreferenceProfile {
    this.getFamilyMember(memberId);

    for (const id of input.dietaryRestrictionIds) {
      if (!isKnownDietaryRestriction(id)) {
        throw unknownRestrictionError(id);
      }
    }

    const preferences: PreferenceProfile = {
      likes: collapseLabels(input.likes),
      dislikes: collapseLabels(input.dislikes),
      dietaryRestrictionIds: [...new Set(input.dietaryRestrictionIds)],
    };

    const ts = nowIso();
    this.db
      .update(preferenceProfiles)
      .set({
        likesJson: JSON.stringify(preferences.likes),
        dislikesJson: JSON.stringify(preferences.dislikes),
        dietaryRestrictionIdsJson: JSON.stringify(preferences.dietaryRestrictionIds),
        updatedAt: ts,
      })
      .where(eq(preferenceProfiles.familyMemberId, memberId))
      .run();

    return preferences;
  }

  updateFamilyMember(memberId: string, rawName: string): FamilyMemberDetail {
    const displayName = assertValidDisplayName(rawName);
    const displayNameKey = toDisplayNameKey(displayName);

    const member = this.db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.id, memberId))
      .get();

    if (!member || member.householdId !== this.householdId) {
      throw notFoundError();
    }

    const conflict = this.db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.householdId, this.householdId),
          eq(familyMembers.displayNameKey, displayNameKey),
          ne(familyMembers.id, memberId),
        ),
      )
      .get();

    if (conflict) {
      throw duplicateNameError();
    }

    const ts = nowIso();
    this.db
      .update(familyMembers)
      .set({ displayName, displayNameKey, updatedAt: ts })
      .where(eq(familyMembers.id, memberId))
      .run();

    return this.getFamilyMember(memberId);
  }

  deleteFamilyMember(memberId: string): void {
    const member = this.db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.id, memberId))
      .get();

    if (!member || member.householdId !== this.householdId) {
      throw notFoundError();
    }

    this.db.delete(familyMembers).where(eq(familyMembers.id, memberId)).run();
  }
}
