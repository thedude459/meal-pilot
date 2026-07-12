import type { PreferenceProfile } from "./preference-profile.js";
import type { Recipe } from "./recipe.js";
import { WEEKDAYS, type MealSlotView, type SlotStatus, type Weekday } from "./weekly-plan.js";

export const GENERATION_MODES = ["fill-empty", "regenerate-non-approved"] as const;
export type GenerationMode = (typeof GENERATION_MODES)[number];

export type UnfilledReason = "NO_SAFE_CANDIDATES";

export type GenerationReport = {
  mode: GenerationMode;
  filledDays: Weekday[];
  unfilledDays: Array<{ day: Weekday; reason: UnfilledReason }>;
};

export type AlternativeOutcome =
  | { applied: true }
  | { applied: false; reason: "NO_SAFE_ALTERNATIVE" };

export type CandidateRecipe = {
  id: string;
  title: string;
  ingredientNames: string[];
  dietaryAttributeIds: string[];
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  cuisineTags: string[];
};

export type HouseholdPreferenceAggregate = {
  hardRestrictionIds: string[];
  dislikes: string[];
  likes: string[];
};

export function isGenerationMode(value: unknown): value is GenerationMode {
  return typeof value === "string" && (GENERATION_MODES as readonly string[]).includes(value);
}

/** Normalize for case-insensitive phrase/token matching. */
export function normalizeMatchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(normalized: string): string[] {
  return normalized
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Case-insensitive exact equality, token, or contiguous multi-word phrase match
 * of `needle` against `haystack`.
 */
export function matchesPhraseOrToken(needle: string, haystack: string): boolean {
  const n = normalizeMatchText(needle);
  const h = normalizeMatchText(haystack);
  if (!n || !h) return false;
  if (h === n) return true;

  const needleTokens = tokenize(n);
  const hayTokens = tokenize(h);
  if (needleTokens.length === 0 || hayTokens.length === 0) return false;

  if (needleTokens.length === 1) {
    return hayTokens.includes(needleTokens[0]!);
  }

  for (let i = 0; i <= hayTokens.length - needleTokens.length; i++) {
    let ok = true;
    for (let j = 0; j < needleTokens.length; j++) {
      if (hayTokens[i + j] !== needleTokens[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

export function labelMatchesRecipe(label: string, recipe: CandidateRecipe): boolean {
  if (matchesPhraseOrToken(label, recipe.title)) return true;
  return recipe.ingredientNames.some((name) => matchesPhraseOrToken(label, name));
}

export function recipeSatisfiesDietaryRestrictions(
  recipe: CandidateRecipe,
  hardRestrictionIds: string[],
): boolean {
  if (hardRestrictionIds.length === 0) return true;
  const tags = new Set(recipe.dietaryAttributeIds);
  return hardRestrictionIds.every((id) => tags.has(id));
}

export function isRecipeHardSafe(
  recipe: CandidateRecipe,
  prefs: HouseholdPreferenceAggregate,
): boolean {
  if (!recipeSatisfiesDietaryRestrictions(recipe, prefs.hardRestrictionIds)) return false;
  for (const dislike of prefs.dislikes) {
    if (labelMatchesRecipe(dislike, recipe)) return false;
  }
  return true;
}

export function aggregatePreferences(profiles: PreferenceProfile[]): HouseholdPreferenceAggregate {
  const hardRestrictionIds: string[] = [];
  const dislikes: string[] = [];
  const likes: string[] = [];
  const seenR = new Set<string>();
  const seenD = new Set<string>();
  const seenL = new Set<string>();

  for (const profile of profiles) {
    for (const id of profile.dietaryRestrictionIds) {
      if (seenR.has(id)) continue;
      seenR.add(id);
      hardRestrictionIds.push(id);
    }
    for (const d of profile.dislikes) {
      const key = normalizeMatchText(d);
      if (!key || seenD.has(key)) continue;
      seenD.add(key);
      dislikes.push(d.trim());
    }
  }

  for (const profile of profiles) {
    for (const like of profile.likes) {
      const key = normalizeMatchText(like);
      if (!key || seenL.has(key) || seenD.has(key)) continue;
      seenL.add(key);
      likes.push(like.trim());
    }
  }

  return { hardRestrictionIds, dislikes, likes };
}

export function toCandidateRecipe(recipe: Recipe): CandidateRecipe {
  return {
    id: recipe.id,
    title: recipe.title,
    ingredientNames: recipe.ingredients.map((i) => i.name),
    dietaryAttributeIds: [...recipe.dietaryAttributeIds],
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    cuisineTags: [...recipe.cuisineTags],
  };
}

export function eligibleDays(
  mode: GenerationMode,
  slots: MealSlotView[],
): Weekday[] {
  const byDay = new Map(slots.map((s) => [s.day, s]));
  const out: Weekday[] = [];
  for (const day of WEEKDAYS) {
    const slot = byDay.get(day);
    const empty = !slot || slot.recipeId === null;
    const status = slot?.status ?? null;
    if (mode === "fill-empty") {
      if (empty) out.push(day);
    } else if (empty || status === "pending" || status === "rejected") {
      out.push(day);
    }
  }
  return out;
}

function totalMinutes(recipe: CandidateRecipe): number | null {
  const prep = recipe.prepTimeMinutes;
  const cook = recipe.cookTimeMinutes;
  if (prep === null && cook === null) return null;
  return (prep ?? 0) + (cook ?? 0);
}

export type ScoreContext = {
  prefs: HouseholdPreferenceAggregate;
  pantryNames: string[];
  /** Recipe IDs already assigned in the target week (including earlier greedy picks). */
  weekAssignedIds: Set<string>;
  /** Recipe IDs used in prior 2 weeks of household plans. */
  recentRecipeIds: Set<string>;
  /** Cuisine tags already used in this week's assignments. */
  weekCuisines: Set<string>;
  /** When true, apply rotation as hard exclusions; when false, only soft penalties. */
  hardExcludeRotation: boolean;
};

export function scoreCandidate(recipe: CandidateRecipe, ctx: ScoreContext): number | null {
  if (ctx.hardExcludeRotation) {
    if (ctx.weekAssignedIds.has(recipe.id) || ctx.recentRecipeIds.has(recipe.id)) {
      return null;
    }
  }

  let score = 0;

  for (const like of ctx.prefs.likes) {
    if (labelMatchesRecipe(like, recipe)) score += 2;
  }

  if (recipe.ingredientNames.length > 0 && ctx.pantryNames.length > 0) {
    let matched = 0;
    for (const name of recipe.ingredientNames) {
      if (ctx.pantryNames.some((p) => matchesPhraseOrToken(p, name) || matchesPhraseOrToken(name, p))) {
        matched += 1;
      }
    }
    score += matched / recipe.ingredientNames.length;
  }

  const mins = totalMinutes(recipe);
  if (mins !== null) {
    score += Math.max(0, 120 - mins) / 120;
  }

  const firstCuisine = recipe.cuisineTags[0];
  if (firstCuisine && !ctx.weekCuisines.has(normalizeMatchText(firstCuisine))) {
    score += 0.5;
  }

  if (!ctx.hardExcludeRotation) {
    if (ctx.weekAssignedIds.has(recipe.id)) score -= 5;
    else if (ctx.recentRecipeIds.has(recipe.id)) score -= 5;
  }

  return score;
}

export function pickBestCandidate(
  candidates: CandidateRecipe[],
  ctx: ScoreContext,
): CandidateRecipe | null {
  let best: CandidateRecipe | null = null;
  let bestScore = -Infinity;

  for (const recipe of candidates) {
    const s = scoreCandidate(recipe, ctx);
    if (s === null) continue;
    if (
      s > bestScore ||
      (s === bestScore && best !== null && recipe.id.localeCompare(best.id) < 0) ||
      (s === bestScore && best === null)
    ) {
      bestScore = s;
      best = recipe;
    }
  }
  return best;
}

/**
 * Greedy Mon→Sun assignment. Soft-relaxes rotation (hardExcludeRotation → false)
 * when no candidate remains under hard rotation exclusions.
 */
export function assignDaysGreedy(input: {
  days: Weekday[];
  safeCandidates: CandidateRecipe[];
  prefs: HouseholdPreferenceAggregate;
  pantryNames: string[];
  initialWeekAssignedIds: Set<string>;
  recentRecipeIds: Set<string>;
  initialWeekCuisines: Set<string>;
}): { assignments: Map<Weekday, CandidateRecipe>; unfilled: Weekday[] } {
  const assignments = new Map<Weekday, CandidateRecipe>();
  const weekAssignedIds = new Set(input.initialWeekAssignedIds);
  const weekCuisines = new Set(input.initialWeekCuisines);
  const unfilled: Weekday[] = [];

  for (const day of input.days) {
    const baseCtx: Omit<ScoreContext, "hardExcludeRotation"> = {
      prefs: input.prefs,
      pantryNames: input.pantryNames,
      weekAssignedIds,
      recentRecipeIds: input.recentRecipeIds,
      weekCuisines,
    };

    let pick = pickBestCandidate(input.safeCandidates, {
      ...baseCtx,
      hardExcludeRotation: true,
    });
    if (!pick) {
      pick = pickBestCandidate(input.safeCandidates, {
        ...baseCtx,
        hardExcludeRotation: false,
      });
    }

    if (!pick) {
      unfilled.push(day);
      continue;
    }

    assignments.set(day, pick);
    weekAssignedIds.add(pick.id);
    const cuisine = pick.cuisineTags[0];
    if (cuisine) weekCuisines.add(normalizeMatchText(cuisine));
  }

  return { assignments, unfilled };
}

export function buildGenerationReport(
  mode: GenerationMode,
  filledDays: Weekday[],
  unfilledDays: Weekday[],
): GenerationReport {
  return {
    mode,
    filledDays: [...filledDays],
    unfilledDays: unfilledDays.map((day) => ({ day, reason: "NO_SAFE_CANDIDATES" as const })),
  };
}

export function pickAlternative(input: {
  safeCandidates: CandidateRecipe[];
  excludeRecipeId: string;
  prefs: HouseholdPreferenceAggregate;
  pantryNames: string[];
  weekAssignedIds: Set<string>;
  recentRecipeIds: Set<string>;
  weekCuisines: Set<string>;
}): CandidateRecipe | null {
  const candidates = input.safeCandidates.filter((c) => c.id !== input.excludeRecipeId);
  const weekWithoutCurrent = new Set(input.weekAssignedIds);
  weekWithoutCurrent.delete(input.excludeRecipeId);

  const base = {
    prefs: input.prefs,
    pantryNames: input.pantryNames,
    weekAssignedIds: weekWithoutCurrent,
    recentRecipeIds: input.recentRecipeIds,
    weekCuisines: input.weekCuisines,
  };

  return (
    pickBestCandidate(candidates, { ...base, hardExcludeRotation: true }) ??
    pickBestCandidate(candidates, { ...base, hardExcludeRotation: false })
  );
}

/** Subtract calendar days from an ISO YYYY-MM-DD date (UTC). */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function rotationWindowStart(weekStartDate: string): string {
  return addDaysIso(weekStartDate, -14);
}

export function slotStatusOf(slot: MealSlotView): SlotStatus | null {
  return slot.status;
}
