export type PreferenceProfile = {
  likes: string[];
  dislikes: string[];
  dietaryRestrictionIds: string[];
};

function normalizeLabelKey(label: string): string {
  return label.trim().toLowerCase();
}

/** Collapse duplicate labels case-insensitively; preserve first-seen casing. */
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

/**
 * Effective likes for meal-planning consumers: excludes labels that also appear
 * in dislikes (dislike wins) and does not mutate stored lists.
 */
export function effectiveLikes(profile: PreferenceProfile): string[] {
  const dislikeKeys = new Set(profile.dislikes.map(normalizeLabelKey));
  return profile.likes.filter((like) => !dislikeKeys.has(normalizeLabelKey(like)));
}

/** Effective dislikes for meal-planning consumers (stored dislikes as-is after collapse semantics). */
export function effectiveDislikes(profile: PreferenceProfile): string[] {
  return [...profile.dislikes];
}

/** Hard exclusions for meal planning (FR-013). */
export function hardRestrictions(profile: PreferenceProfile): string[] {
  return [...profile.dietaryRestrictionIds];
}

export function emptyPreferenceProfile(): PreferenceProfile {
  return { likes: [], dislikes: [], dietaryRestrictionIds: [] };
}
