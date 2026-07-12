import { and, count, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DEFAULT_HOUSEHOLD_ID, type AppDatabase } from "../db/client.js";
import { mealSlots, recipes, weeklyPlans } from "../db/schema.js";
import {
  notFoundError,
  recipeInUseError,
  validationError,
  weeklyPlanConflictError,
  weeklyPlanLibraryFullError,
} from "../domain/errors.js";
import {
  assertCanSetStatus,
  assertMondayWeekStart,
  isWeekday,
  materializeSlots,
  MAX_WEEKLY_PLANS_PER_HOUSEHOLD,
  normalizeCreateSlots,
  type SlotStatus,
  type Weekday,
  type WeeklyPlan,
  type WeeklyPlanCreateInput,
  type WeeklyPlanSummary,
} from "../domain/weekly-plan.js";

function nowIso(): string {
  return new Date().toISOString();
}

export class WeeklyPlanService {
  constructor(
    private readonly db: AppDatabase,
    private readonly householdId = DEFAULT_HOUSEHOLD_ID,
  ) {}

  listWeeklyPlans(): { items: WeeklyPlanSummary[]; maxWeeklyPlans: number } {
    const rows = this.db
      .select({
        id: weeklyPlans.id,
        householdId: weeklyPlans.householdId,
        weekStartDate: weeklyPlans.weekStartDate,
        createdAt: weeklyPlans.createdAt,
        updatedAt: weeklyPlans.updatedAt,
      })
      .from(weeklyPlans)
      .where(eq(weeklyPlans.householdId, this.householdId))
      .orderBy(desc(weeklyPlans.weekStartDate))
      .all();

    const items = rows.map((row) => {
      const filled = this.db
        .select({ id: mealSlots.id })
        .from(mealSlots)
        .where(eq(mealSlots.weeklyPlanId, row.id))
        .all();
      return {
        id: row.id,
        householdId: row.householdId,
        weekStartDate: row.weekStartDate,
        filledSlotCount: filled.length,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    return { items, maxWeeklyPlans: MAX_WEEKLY_PLANS_PER_HOUSEHOLD };
  }

  getWeeklyPlan(weeklyPlanId: string): WeeklyPlan {
    const plan = this.loadPlanRow(weeklyPlanId);
    if (!plan) {
      throw notFoundError("Weekly plan not found");
    }
    return this.toWeeklyPlan(plan);
  }

  /** Returns the household plan for a week-start, or null if none. */
  findByWeekStart(weekStartDate: string): WeeklyPlan | null {
    const row = this.db
      .select()
      .from(weeklyPlans)
      .where(
        and(
          eq(weeklyPlans.householdId, this.householdId),
          eq(weeklyPlans.weekStartDate, weekStartDate),
        ),
      )
      .get();
    return row ? this.toWeeklyPlan(row) : null;
  }

  /**
   * Recipe IDs appearing on plans whose week_start is in
   * [windowStart, exclusiveEnd) for this household.
   */
  recipeIdsInWeekStartRange(windowStart: string, exclusiveEnd: string): Set<string> {
    const plans = this.db
      .select({ id: weeklyPlans.id, weekStartDate: weeklyPlans.weekStartDate })
      .from(weeklyPlans)
      .where(eq(weeklyPlans.householdId, this.householdId))
      .all()
      .filter((p) => p.weekStartDate >= windowStart && p.weekStartDate < exclusiveEnd);

    const ids = new Set<string>();
    for (const plan of plans) {
      const slots = this.db
        .select({ recipeId: mealSlots.recipeId })
        .from(mealSlots)
        .where(eq(mealSlots.weeklyPlanId, plan.id))
        .all();
      for (const s of slots) ids.add(s.recipeId);
    }
    return ids;
  }

  createWeeklyPlan(input: WeeklyPlanCreateInput): WeeklyPlan {
    const weekStartDate = assertMondayWeekStart(input.weekStartDate);
    const slots = normalizeCreateSlots(input.slots);
    this.assertLibraryCapacity();
    this.assertWeekAvailable(weekStartDate);

    for (const slot of slots) {
      this.loadRecipe(slot.recipeId);
    }

    const id = randomUUID();
    const now = nowIso();
    this.db
      .insert(weeklyPlans)
      .values({
        id,
        householdId: this.householdId,
        weekStartDate,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    for (const slot of slots) {
      this.db
        .insert(mealSlots)
        .values({
          id: randomUUID(),
          weeklyPlanId: id,
          day: slot.day,
          recipeId: slot.recipeId,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return this.getWeeklyPlan(id);
  }

  assignSlot(weeklyPlanId: string, day: string, recipeId: string): WeeklyPlan {
    if (!isWeekday(day)) {
      throw validationError(`Invalid day: ${day}`);
    }
    const plan = this.loadPlanRow(weeklyPlanId);
    if (!plan) {
      throw notFoundError("Weekly plan not found");
    }
    this.loadRecipe(recipeId);

    const now = nowIso();
    const existing = this.db
      .select({ id: mealSlots.id })
      .from(mealSlots)
      .where(and(eq(mealSlots.weeklyPlanId, weeklyPlanId), eq(mealSlots.day, day)))
      .get();

    if (existing) {
      this.db
        .update(mealSlots)
        .set({ recipeId, status: "pending", updatedAt: now })
        .where(eq(mealSlots.id, existing.id))
        .run();
    } else {
      this.db
        .insert(mealSlots)
        .values({
          id: randomUUID(),
          weeklyPlanId,
          day,
          recipeId,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    this.bumpPlanUpdatedAt(weeklyPlanId, now);
    return this.getWeeklyPlan(weeklyPlanId);
  }

  clearSlot(weeklyPlanId: string, day: string): WeeklyPlan {
    if (!isWeekday(day)) {
      throw validationError(`Invalid day: ${day}`);
    }
    const plan = this.loadPlanRow(weeklyPlanId);
    if (!plan) {
      throw notFoundError("Weekly plan not found");
    }

    this.db
      .delete(mealSlots)
      .where(and(eq(mealSlots.weeklyPlanId, weeklyPlanId), eq(mealSlots.day, day)))
      .run();

    this.bumpPlanUpdatedAt(weeklyPlanId, nowIso());
    return this.getWeeklyPlan(weeklyPlanId);
  }

  setSlotStatus(weeklyPlanId: string, day: string, statusInput: unknown): WeeklyPlan {
    if (!isWeekday(day)) {
      throw validationError(`Invalid day: ${day}`);
    }
    const plan = this.loadPlanRow(weeklyPlanId);
    if (!plan) {
      throw notFoundError("Weekly plan not found");
    }

    const existing = this.db
      .select({ id: mealSlots.id, recipeId: mealSlots.recipeId })
      .from(mealSlots)
      .where(and(eq(mealSlots.weeklyPlanId, weeklyPlanId), eq(mealSlots.day, day)))
      .get();

    const status = assertCanSetStatus(statusInput, Boolean(existing));
    const now = nowIso();
    this.db
      .update(mealSlots)
      .set({ status, updatedAt: now })
      .where(eq(mealSlots.id, existing!.id))
      .run();

    this.bumpPlanUpdatedAt(weeklyPlanId, now);
    return this.getWeeklyPlan(weeklyPlanId);
  }

  deleteWeeklyPlan(weeklyPlanId: string): void {
    const plan = this.loadPlanRow(weeklyPlanId);
    if (!plan) {
      throw notFoundError("Weekly plan not found");
    }
    this.db
      .delete(weeklyPlans)
      .where(and(eq(weeklyPlans.id, weeklyPlanId), eq(weeklyPlans.householdId, this.householdId)))
      .run();
  }

  private toWeeklyPlan(plan: {
    id: string;
    householdId: string;
    weekStartDate: string;
    createdAt: string;
    updatedAt: string;
  }): WeeklyPlan {
    const filled = this.db
      .select({
        day: mealSlots.day,
        recipeId: mealSlots.recipeId,
        status: mealSlots.status,
        recipeTitle: recipes.title,
      })
      .from(mealSlots)
      .innerJoin(recipes, eq(mealSlots.recipeId, recipes.id))
      .where(eq(mealSlots.weeklyPlanId, plan.id))
      .all();

    return {
      id: plan.id,
      householdId: plan.householdId,
      weekStartDate: plan.weekStartDate,
      slots: materializeSlots(filled),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private loadPlanRow(weeklyPlanId: string) {
    return this.db
      .select()
      .from(weeklyPlans)
      .where(
        and(eq(weeklyPlans.id, weeklyPlanId), eq(weeklyPlans.householdId, this.householdId)),
      )
      .get();
  }

  private loadRecipe(recipeId: string): { id: string; title: string } {
    const row = this.db
      .select({ id: recipes.id, title: recipes.title })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.householdId, this.householdId)))
      .get();
    if (!row) {
      throw notFoundError("Recipe not found");
    }
    return row;
  }

  private assertLibraryCapacity(): void {
    const result = this.db
      .select({ value: count() })
      .from(weeklyPlans)
      .where(eq(weeklyPlans.householdId, this.householdId))
      .get();
    if ((result?.value ?? 0) >= MAX_WEEKLY_PLANS_PER_HOUSEHOLD) {
      throw weeklyPlanLibraryFullError();
    }
  }

  private assertWeekAvailable(weekStartDate: string): void {
    const existing = this.db
      .select({ id: weeklyPlans.id })
      .from(weeklyPlans)
      .where(
        and(
          eq(weeklyPlans.householdId, this.householdId),
          eq(weeklyPlans.weekStartDate, weekStartDate),
        ),
      )
      .get();
    if (existing) {
      throw weeklyPlanConflictError();
    }
  }

  private bumpPlanUpdatedAt(weeklyPlanId: string, now: string): void {
    this.db
      .update(weeklyPlans)
      .set({ updatedAt: now })
      .where(eq(weeklyPlans.id, weeklyPlanId))
      .run();
  }
}

/** Used by RecipeService to block delete while referenced by a meal slot. */
export function assertRecipeNotInPlan(
  db: AppDatabase,
  householdId: string,
  recipeId: string,
): void {
  const listed = db
    .select({ id: mealSlots.id })
    .from(mealSlots)
    .innerJoin(weeklyPlans, eq(mealSlots.weeklyPlanId, weeklyPlans.id))
    .where(and(eq(weeklyPlans.householdId, householdId), eq(mealSlots.recipeId, recipeId)))
    .get();
  if (listed) {
    throw recipeInUseError();
  }
}

// Re-export types used by callers / tests
export type { SlotStatus, Weekday, WeeklyPlan, WeeklyPlanCreateInput, WeeklyPlanSummary };
