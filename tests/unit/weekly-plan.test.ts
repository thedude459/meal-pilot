import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/domain/errors.js";
import {
  assertCanSetStatus,
  assertMondayWeekStart,
  isSlotStatus,
  isWeekday,
  materializeSlots,
  normalizeCreateSlots,
  WEEKDAYS,
} from "../../src/domain/weekly-plan.js";

describe("weekly-plan domain", () => {
  it("accepts Monday UTC ISO dates and rejects non-Monday / malformed", () => {
    expect(assertMondayWeekStart("2026-07-13")).toBe("2026-07-13");
    expect(assertMondayWeekStart("2020-01-06")).toBe("2020-01-06");
    try {
      assertMondayWeekStart("2026-07-14");
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    try {
      assertMondayWeekStart("not-a-date");
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    try {
      assertMondayWeekStart("2026-02-30");
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it("validates weekday and status enums", () => {
    expect(isWeekday("monday")).toBe(true);
    expect(isWeekday("funday")).toBe(false);
    expect(isSlotStatus("pending")).toBe(true);
    expect(isSlotStatus("suggested")).toBe(false);
    expect(WEEKDAYS).toHaveLength(7);
  });

  it("materializes seven days with empty slots null", () => {
    const slots = materializeSlots([
      {
        day: "wednesday",
        recipeId: "r1",
        recipeTitle: "Soup",
        status: "pending",
      },
    ]);
    expect(slots).toHaveLength(7);
    expect(slots[0]).toEqual({
      day: "monday",
      recipeId: null,
      recipeTitle: null,
      status: null,
    });
    expect(slots[2]).toEqual({
      day: "wednesday",
      recipeId: "r1",
      recipeTitle: "Soup",
      status: "pending",
    });
  });

  it("rejects duplicate days in create slots", () => {
    try {
      normalizeCreateSlots([
        { day: "monday", recipeId: "a" },
        { day: "monday", recipeId: "b" },
      ]);
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it("status transitions: empty cannot set; assign yields pending semantics", () => {
    try {
      assertCanSetStatus("approved", false);
      expect.fail("expected VALIDATION_ERROR");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
    expect(assertCanSetStatus("pending", true)).toBe("pending");
    expect(assertCanSetStatus("approved", true)).toBe("approved");
    expect(assertCanSetStatus("rejected", true)).toBe("rejected");
  });
});
