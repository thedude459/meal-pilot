import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/domain/errors.js";
import {
  assertUnitMatchesDefault,
  normalizePantryItemInput,
  normalizePantryItemReplaceInput,
  parseExpirationDate,
  normalizeQuantity,
} from "../../src/domain/pantry-item.js";
import { QUANTITY_DECIMAL_PLACES, roundQuantity } from "../../src/domain/quantity.js";

describe("pantry-item domain", () => {
  it("roundQuantity matches shared 3-decimal places", () => {
    expect(QUANTITY_DECIMAL_PLACES).toBe(3);
    expect(roundQuantity(1.2345)).toBe(1.235);
    expect(normalizeQuantity(1.2345)).toBe(1.235);
  });

  it("rejects non-positive quantity with PANTRY_LIMIT", () => {
    try {
      normalizeQuantity(0);
      expect.fail("expected PANTRY_LIMIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.PANTRY_LIMIT);
    }
    try {
      normalizeQuantity(-1);
      expect.fail("expected PANTRY_LIMIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.PANTRY_LIMIT);
    }
  });

  it("parseExpirationDate accepts past/today/future and null", () => {
    expect(parseExpirationDate(null)).toBeNull();
    expect(parseExpirationDate(undefined)).toBeNull();
    expect(parseExpirationDate("2020-01-15")).toBe("2020-01-15");
    expect(parseExpirationDate("2099-12-31")).toBe("2099-12-31");
    const today = new Date().toISOString().slice(0, 10);
    expect(parseExpirationDate(today)).toBe(today);
  });

  it("parseExpirationDate rejects invalid formats with PANTRY_LIMIT", () => {
    for (const bad of ["2020-1-1", "01/15/2020", "2020-13-01", "not-a-date", ""]) {
      try {
        parseExpirationDate(bad);
        expect.fail(`expected PANTRY_LIMIT for ${bad}`);
      } catch (err) {
        expect((err as { code: string }).code).toBe(ErrorCode.PANTRY_LIMIT);
      }
    }
  });

  it("assertUnitMatchesDefault raises UNIT_MISMATCH", () => {
    try {
      assertUnitMatchesDefault("cup", "tbsp");
      expect.fail("expected UNIT_MISMATCH");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNIT_MISMATCH);
    }
  });

  it("normalize create/replace validates unit against default", () => {
    const created = normalizePantryItemInput(
      { ingredientId: "11111111-1111-1111-1111-111111111111", quantity: 2.5, unitId: "tbsp" },
      "tbsp",
    );
    expect(created).toEqual({ quantity: 2.5, unitId: "tbsp", expirationDate: null });

    const replaced = normalizePantryItemReplaceInput(
      { quantity: 1, unitId: "tbsp", expirationDate: "2026-12-01" },
      "tbsp",
    );
    expect(replaced.expirationDate).toBe("2026-12-01");

    try {
      normalizePantryItemInput(
        { ingredientId: "11111111-1111-1111-1111-111111111111", quantity: 1, unitId: "cup" },
        "tbsp",
      );
      expect.fail("expected UNIT_MISMATCH");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNIT_MISMATCH);
    }
  });
});
