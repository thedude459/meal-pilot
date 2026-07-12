import { labelKey, normalizeIngredientLabel } from "./ingredient.js";
import { roundQuantity } from "./quantity.js";
import { WEEKDAYS, type Weekday } from "./weekly-plan.js";

export type CatalogIngredient = {
  id: string;
  displayName: string;
  defaultUnitId: string;
  aliases: string[];
};

export type RecipeIngredientLine = {
  name: string;
  quantity: number;
  unitId: string;
};

export type ApprovedSlotSource = {
  day: Weekday;
  recipeId: string;
  ingredients: RecipeIngredientLine[];
};

export type ExistingGroceryLine = {
  id: string;
  ingredientId: string;
  quantity: number;
  unitId: string;
  checked: boolean;
};

export type PantryStock = {
  ingredientId: string;
  quantity: number;
  expirationDate: string | null;
};

export type UnmatchedEntry = {
  recipeId: string;
  day: Weekday;
  ingredientName: string;
  quantity: number;
  unitId: string;
  lineIndex: number;
};

export type UnitConflictEntry = {
  recipeId: string;
  day: Weekday;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unitId: string;
  expectedUnitId: string;
  lineIndex: number;
};

export type PantryCoveredEntry = {
  ingredientId: string;
  mergedNeed: number;
  availablePantry: number;
};

export type CheckedSkipEntry = {
  ingredientId: string;
  checkedQuantity: number;
  netNeed: number;
  remainingShortfall: number;
};

export type BuildReport = {
  weekStartDate: string;
  approvedSlotCount: number;
  created: string[];
  updated: string[];
  removed: string[];
  pantryCovered: PantryCoveredEntry[];
  unmatched: Omit<UnmatchedEntry, "lineIndex">[];
  unitConflicts: Omit<UnitConflictEntry, "lineIndex">[];
  checkedSkips: CheckedSkipEntry[];
};

export type SyncCreate = {
  ingredientId: string;
  quantity: number;
  unitId: string;
  displayNameKey: string;
};

export type SyncUpdate = {
  groceryItemId: string;
  ingredientId: string;
  quantity: number;
  unitId: string;
  displayNameKey: string;
};

export type SyncDelete = {
  groceryItemId: string;
  ingredientId: string;
  displayNameKey: string;
};

export type GrocerySyncPlan = {
  creates: SyncCreate[];
  updates: SyncUpdate[];
  deletes: SyncDelete[];
  report: BuildReport;
  /** Projected grocery row count after applying sync */
  projectedCount: number;
};

export type MatchIndex = Map<string, CatalogIngredient>;

/** Build label-key → Ingredient index (display name + aliases). */
export function buildCatalogMatchIndex(catalog: CatalogIngredient[]): MatchIndex {
  const index: MatchIndex = new Map();
  for (const ingredient of catalog) {
    const keys = [
      labelKey(normalizeIngredientLabel(ingredient.displayName)),
      ...ingredient.aliases.map((a) => labelKey(normalizeIngredientLabel(a))),
    ];
    for (const key of keys) {
      index.set(key, ingredient);
    }
  }
  return index;
}

export function matchRecipeName(
  name: string,
  index: MatchIndex,
): CatalogIngredient | undefined {
  const key = labelKey(normalizeIngredientLabel(name));
  return index.get(key);
}

/** UTC calendar date YYYY-MM-DD for "today". */
export function utcToday(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Pantry qty is available if no expiration or expiration >= todayUTC. */
export function availablePantryQuantity(
  pantry: PantryStock | undefined,
  todayUtc: string,
): number {
  if (!pantry) return 0;
  if (pantry.expirationDate === null) return pantry.quantity;
  if (pantry.expirationDate >= todayUtc) return pantry.quantity;
  return 0;
}

type MergeAccumulator = {
  ingredient: CatalogIngredient;
  mergedNeed: number;
  displayNameKey: string;
};

export type MergeResult = {
  /** Ingredients name-matched from approved meals (including qty 0). */
  mergedSet: Map<string, MergeAccumulator>;
  unmatched: UnmatchedEntry[];
  unitConflicts: UnitConflictEntry[];
};

export function mergeApprovedIngredients(
  slots: ApprovedSlotSource[],
  index: MatchIndex,
): MergeResult {
  const mergedSet = new Map<string, MergeAccumulator>();
  const unmatched: UnmatchedEntry[] = [];
  const unitConflicts: UnitConflictEntry[] = [];

  for (const slot of slots) {
    slot.ingredients.forEach((line, lineIndex) => {
      const matched = matchRecipeName(line.name, index);
      if (!matched) {
        unmatched.push({
          recipeId: slot.recipeId,
          day: slot.day,
          ingredientName: line.name,
          quantity: line.quantity,
          unitId: line.unitId,
          lineIndex,
        });
        return;
      }

      const displayNameKey = labelKey(normalizeIngredientLabel(matched.displayName));
      let acc = mergedSet.get(matched.id);
      if (!acc) {
        acc = { ingredient: matched, mergedNeed: 0, displayNameKey };
        mergedSet.set(matched.id, acc);
      }

      if (line.unitId !== matched.defaultUnitId) {
        unitConflicts.push({
          recipeId: slot.recipeId,
          day: slot.day,
          ingredientId: matched.id,
          ingredientName: line.name,
          quantity: line.quantity,
          unitId: line.unitId,
          expectedUnitId: matched.defaultUnitId,
          lineIndex,
        });
        return;
      }

      acc.mergedNeed = roundQuantity(acc.mergedNeed + roundQuantity(line.quantity));
    });
  }

  return { mergedSet, unmatched, unitConflicts };
}

function weekdayRank(day: Weekday): number {
  return WEEKDAYS.indexOf(day);
}

function stripLineIndex<T extends { lineIndex: number }>(
  entries: T[],
): Omit<T, "lineIndex">[] {
  return entries.map(({ lineIndex: _lineIndex, ...rest }) => rest);
}

export function buildGrocerySyncPlan(input: {
  weekStartDate: string;
  approvedSlotCount: number;
  slots: ApprovedSlotSource[];
  catalog: CatalogIngredient[];
  pantryByIngredientId: Map<string, PantryStock>;
  existingGrocery: ExistingGroceryLine[];
  todayUtc?: string;
}): GrocerySyncPlan {
  const todayUtc = input.todayUtc ?? utcToday();
  const index = buildCatalogMatchIndex(input.catalog);
  const { mergedSet, unmatched, unitConflicts } = mergeApprovedIngredients(
    input.slots,
    index,
  );

  const groceryByIngredient = new Map(
    input.existingGrocery.map((g) => [g.ingredientId, g]),
  );

  const creates: SyncCreate[] = [];
  const updates: SyncUpdate[] = [];
  const deletes: SyncDelete[] = [];
  const pantryCovered: PantryCoveredEntry[] = [];
  const checkedSkips: CheckedSkipEntry[] = [];

  for (const [ingredientId, acc] of mergedSet) {
    const available = availablePantryQuantity(
      input.pantryByIngredientId.get(ingredientId),
      todayUtc,
    );
    const netNeed = Math.max(0, roundQuantity(acc.mergedNeed - available));
    const existing = groceryByIngredient.get(ingredientId);

    if (netNeed === 0 && acc.mergedNeed > 0) {
      pantryCovered.push({
        ingredientId,
        mergedNeed: acc.mergedNeed,
        availablePantry: available,
      });
    } else if (netNeed === 0 && acc.mergedNeed === 0) {
      // name-matched but no successful unit lines (or zero after pantry on zero)
    }

    if (existing?.checked) {
      checkedSkips.push({
        ingredientId,
        checkedQuantity: existing.quantity,
        netNeed,
        remainingShortfall: Math.max(0, roundQuantity(netNeed - existing.quantity)),
      });
      continue;
    }

    if (netNeed > 0) {
      if (!existing) {
        creates.push({
          ingredientId,
          quantity: netNeed,
          unitId: acc.ingredient.defaultUnitId,
          displayNameKey: acc.displayNameKey,
        });
      } else {
        updates.push({
          groceryItemId: existing.id,
          ingredientId,
          quantity: netNeed,
          unitId: acc.ingredient.defaultUnitId,
          displayNameKey: acc.displayNameKey,
        });
      }
    } else if (existing && !existing.checked) {
      deletes.push({
        groceryItemId: existing.id,
        ingredientId,
        displayNameKey: acc.displayNameKey,
      });
    }
  }

  const byNameKey = (a: { displayNameKey: string }, b: { displayNameKey: string }) =>
    a.displayNameKey.localeCompare(b.displayNameKey, "en-US");

  creates.sort(byNameKey);
  updates.sort(byNameKey);
  deletes.sort(byNameKey);

  const nameKeyById = new Map(
    [...mergedSet.entries()].map(([id, acc]) => [id, acc.displayNameKey]),
  );
  // Also resolve display keys for checked/pantry from catalog
  for (const c of input.catalog) {
    if (!nameKeyById.has(c.id)) {
      nameKeyById.set(c.id, labelKey(normalizeIngredientLabel(c.displayName)));
    }
  }

  pantryCovered.sort((a, b) =>
    (nameKeyById.get(a.ingredientId) ?? a.ingredientId).localeCompare(
      nameKeyById.get(b.ingredientId) ?? b.ingredientId,
      "en-US",
    ),
  );
  checkedSkips.sort((a, b) =>
    (nameKeyById.get(a.ingredientId) ?? a.ingredientId).localeCompare(
      nameKeyById.get(b.ingredientId) ?? b.ingredientId,
      "en-US",
    ),
  );

  unmatched.sort(
    (a, b) =>
      weekdayRank(a.day) - weekdayRank(b.day) || a.lineIndex - b.lineIndex,
  );
  unitConflicts.sort(
    (a, b) =>
      weekdayRank(a.day) - weekdayRank(b.day) || a.lineIndex - b.lineIndex,
  );

  const projectedCount =
    input.existingGrocery.length + creates.length - deletes.length;

  const report: BuildReport = {
    weekStartDate: input.weekStartDate,
    approvedSlotCount: input.approvedSlotCount,
    created: creates.map((c) => c.ingredientId),
    updated: updates.map((u) => u.ingredientId),
    removed: deletes.map((d) => d.ingredientId),
    pantryCovered,
    unmatched: stripLineIndex(unmatched),
    unitConflicts: stripLineIndex(unitConflicts),
    checkedSkips,
  };

  return { creates, updates, deletes, report, projectedCount };
}
