import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/domain/errors.js";
import {
  assertPreferenceLimits,
  collapseLabels,
  collapseRestrictionIds,
  MAX_DISLIKES,
  MAX_LABEL_LENGTH,
  MAX_LIKES,
  normalizePreferenceInput,
} from "../../src/domain/preference-profile.js";

describe("preference-profile normalize/limits", () => {
  it("trims blanks and collapses case-insensitive like/dislike duplicates preserving order", () => {
    const normalized = normalizePreferenceInput({
      likes: [" pasta ", "Pasta", "tacos", ""],
      dislikes: [" olives ", "OLIVES", "  "],
      dietaryRestrictionIds: [],
    });
    expect(normalized.likes).toEqual(["pasta", "tacos"]);
    expect(normalized.dislikes).toEqual(["olives"]);
  });

  it("collapses duplicate restriction IDs preserving first-seen order", () => {
    expect(collapseRestrictionIds(["gluten_free", "nut_free", "gluten_free"])).toEqual([
      "gluten_free",
      "nut_free",
    ]);
  });

  it("collapseLabels preserves relative order", () => {
    expect(collapseLabels(["b", "a", "c"])).toEqual(["b", "a", "c"]);
  });

  it("rejects labels longer than MAX_LABEL_LENGTH", () => {
    const profile = normalizePreferenceInput({
      likes: ["x".repeat(MAX_LABEL_LENGTH + 1)],
      dislikes: [],
      dietaryRestrictionIds: [],
    });
    try {
      assertPreferenceLimits(profile);
      expect.fail("expected PREFERENCE_LIMIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.PREFERENCE_LIMIT);
    }
  });

  it("rejects more than MAX_LIKES after normalization", () => {
    const likes = Array.from({ length: MAX_LIKES + 1 }, (_, i) => `like-${i}`);
    const profile = normalizePreferenceInput({
      likes,
      dislikes: [],
      dietaryRestrictionIds: [],
    });
    expect(() => assertPreferenceLimits(profile)).toThrow();
    try {
      assertPreferenceLimits(profile);
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.PREFERENCE_LIMIT);
    }
  });

  it("allows exactly MAX_DISLIKES labels of MAX_LABEL_LENGTH", () => {
    const dislikes = Array.from({ length: MAX_DISLIKES }, (_, i) =>
      `d${i}`.padEnd(MAX_LABEL_LENGTH, "x"),
    );
    const profile = normalizePreferenceInput({
      likes: [],
      dislikes,
      dietaryRestrictionIds: ["gluten_free", "gluten_free"],
    });
    expect(profile.dietaryRestrictionIds).toEqual(["gluten_free"]);
    expect(() => assertPreferenceLimits(profile)).not.toThrow();
  });
});
