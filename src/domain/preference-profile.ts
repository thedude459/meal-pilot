import { preferenceLimitError } from "./errors.js";

export type PreferenceProfile = {
  likes: string[];
  dislikes: string[];
  dietaryRestrictionIds: string[];
};

export const MAX_LABEL_LENGTH = 40;
export const MAX_LIKES = 50;
export const MAX_DISLIKES = 50;

export type EffectivePreferenceProfile = {
  effectiveLikes: string[];
  effectiveDislikes: string[];
  hardRestrictions: string[];
};

function normalizeLabelKey(label: string): string {
  return label.trim().toLowerCase();
}

/** Collapse duplicate labels case-insensitively; preserve first-seen casing and order. */
export function collapseLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of labels) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizeLabelKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/** Collapse duplicate restriction IDs; preserve first-seen order. */
export function collapseRestrictionIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function normalizePreferenceInput(input: {
  likes: string[];
  dislikes: string[];
  dietaryRestrictionIds: string[];
}): PreferenceProfile {
  return {
    likes: collapseLabels(input.likes),
    dislikes: collapseLabels(input.dislikes),
    dietaryRestrictionIds: collapseRestrictionIds(input.dietaryRestrictionIds),
  };
}

/** Reject over-length labels or over-count lists after normalization (FR-010). */
export function assertPreferenceLimits(profile: PreferenceProfile): void {
  for (const label of [...profile.likes, ...profile.dislikes]) {
    if (label.length > MAX_LABEL_LENGTH) {
      throw preferenceLimitError(
        `Like/dislike labels must be at most ${MAX_LABEL_LENGTH} characters`,
      );
    }
  }
  if (profile.likes.length > MAX_LIKES) {
    throw preferenceLimitError(`At most ${MAX_LIKES} likes are allowed`);
  }
  if (profile.dislikes.length > MAX_DISLIKES) {
    throw preferenceLimitError(`At most ${MAX_DISLIKES} dislikes are allowed`);
  }
}

/**
 * Effective likes for meal-planning consumers: excludes labels that also appear
 * in dislikes (dislike wins). Does not filter against dietary restrictions and
 * does not mutate stored lists.
 */
export function effectiveLikes(profile: PreferenceProfile): string[] {
  const dislikeKeys = new Set(profile.dislikes.map(normalizeLabelKey));
  return profile.likes.filter((like) => !dislikeKeys.has(normalizeLabelKey(like)));
}

/** Effective dislikes for meal-planning consumers (stored dislikes as-is). */
export function effectiveDislikes(profile: PreferenceProfile): string[] {
  return [...profile.dislikes];
}

/** Hard exclusions exposed for meal-matching consumers (FR-013). */
export function hardRestrictions(profile: PreferenceProfile): string[] {
  return [...profile.dietaryRestrictionIds];
}

export function toEffectivePreferences(profile: PreferenceProfile): EffectivePreferenceProfile {
  return {
    effectiveLikes: effectiveLikes(profile),
    effectiveDislikes: effectiveDislikes(profile),
    hardRestrictions: hardRestrictions(profile),
  };
}

export function emptyPreferenceProfile(): PreferenceProfile {
  return { likes: [], dislikes: [], dietaryRestrictionIds: [] };
}
