import { validationError } from "./errors.js";

export const MAX_WEEKLY_PLANS_PER_HOUSEHOLD = 104;

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const SLOT_STATUSES = ["pending", "approved", "rejected"] as const;

export type SlotStatus = (typeof SLOT_STATUSES)[number];

export type MealSlotView = {
  day: Weekday;
  recipeId: string | null;
  recipeTitle: string | null;
  status: SlotStatus | null;
};

export type WeeklyPlan = {
  id: string;
  householdId: string;
  weekStartDate: string;
  slots: MealSlotView[];
  createdAt: string;
  updatedAt: string;
};

export type WeeklyPlanSummary = {
  id: string;
  householdId: string;
  weekStartDate: string;
  filledSlotCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateSlotInput = {
  day: Weekday;
  recipeId: string;
};

export type WeeklyPlanCreateInput = {
  weekStartDate: string;
  slots?: CreateSlotInput[];
};

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

export function isSlotStatus(value: string): value is SlotStatus {
  return (SLOT_STATUSES as readonly string[]).includes(value);
}

/** Validate ISO YYYY-MM-DD and require Monday in UTC calendar terms. */
export function assertMondayWeekStart(weekStartDate: string): string {
  if (typeof weekStartDate !== "string" || !ISO_DATE_RE.test(weekStartDate)) {
    throw validationError("weekStartDate must be an ISO date YYYY-MM-DD");
  }
  const match = ISO_DATE_RE.exec(weekStartDate)!;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw validationError("weekStartDate must be a valid calendar date");
  }
  if (utc.getUTCDay() !== 1) {
    throw validationError("weekStartDate must be a Monday");
  }
  return weekStartDate;
}

export function normalizeCreateSlots(
  slots: CreateSlotInput[] | undefined,
): CreateSlotInput[] {
  if (slots === undefined || slots.length === 0) {
    return [];
  }
  if (slots.length > 7) {
    throw validationError("slots cannot include more than 7 days");
  }
  const seen = new Set<Weekday>();
  const normalized: CreateSlotInput[] = [];
  for (const slot of slots) {
    if (!slot || typeof slot !== "object") {
      throw validationError("Invalid slot entry");
    }
    if (!isWeekday(slot.day)) {
      throw validationError(`Invalid day: ${String(slot.day)}`);
    }
    if (seen.has(slot.day)) {
      throw validationError(`Duplicate day in slots: ${slot.day}`);
    }
    if (typeof slot.recipeId !== "string" || slot.recipeId.length === 0) {
      throw validationError("recipeId is required for each slot");
    }
    seen.add(slot.day);
    normalized.push({ day: slot.day, recipeId: slot.recipeId });
  }
  return normalized;
}

export function materializeSlots(
  filled: Array<{
    day: string;
    recipeId: string;
    recipeTitle: string;
    status: string;
  }>,
): MealSlotView[] {
  const byDay = new Map(
    filled.map((s) => [
      s.day,
      {
        day: s.day as Weekday,
        recipeId: s.recipeId,
        recipeTitle: s.recipeTitle,
        status: s.status as SlotStatus,
      },
    ]),
  );
  return WEEKDAYS.map((day) => {
    const existing = byDay.get(day);
    if (!existing) {
      return { day, recipeId: null, recipeTitle: null, status: null };
    }
    return existing;
  });
}

export function assertCanSetStatus(status: unknown, hasRecipe: boolean): SlotStatus {
  if (!hasRecipe) {
    throw validationError("Cannot set status on an empty slot; assign a Recipe first");
  }
  if (typeof status !== "string" || !isSlotStatus(status)) {
    throw validationError("status must be pending, approved, or rejected");
  }
  return status;
}
