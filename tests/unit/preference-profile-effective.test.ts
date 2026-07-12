import { describe, expect, it } from "vitest";
import {
  effectiveDislikes,
  effectiveLikes,
  hardRestrictions,
  toEffectivePreferences,
  type PreferenceProfile,
} from "../../src/domain/preference-profile.js";

describe("preference-profile effective helpers", () => {
  const profile: PreferenceProfile = {
    likes: ["pasta", "tacos", "olives"],
    dislikes: ["Pasta", "mushrooms"],
    dietaryRestrictionIds: ["gluten_free", "nut_free"],
  };

  it("applies dislike-wins without mutating stored lists", () => {
    const likes = effectiveLikes(profile);
    expect(likes).toEqual(["tacos", "olives"]);
    expect(profile.likes).toEqual(["pasta", "tacos", "olives"]);
  });

  it("does not filter likes against dietary restrictions", () => {
    const withLikeMatchingRestrictionName: PreferenceProfile = {
      likes: ["vegetarian", "pasta"],
      dislikes: [],
      dietaryRestrictionIds: ["vegetarian"],
    };
    expect(effectiveLikes(withLikeMatchingRestrictionName)).toEqual(["vegetarian", "pasta"]);
    expect(hardRestrictions(withLikeMatchingRestrictionName)).toEqual(["vegetarian"]);
  });

  it("returns stored dislikes and hard restrictions", () => {
    expect(effectiveDislikes(profile)).toEqual(["Pasta", "mushrooms"]);
    expect(hardRestrictions(profile)).toEqual(["gluten_free", "nut_free"]);
  });

  it("toEffectivePreferences composes all views", () => {
    expect(toEffectivePreferences(profile)).toEqual({
      effectiveLikes: ["tacos", "olives"],
      effectiveDislikes: ["Pasta", "mushrooms"],
      hardRestrictions: ["gluten_free", "nut_free"],
    });
  });

  it("preserves order in effective likes after dislike filter", () => {
    const ordered: PreferenceProfile = {
      likes: ["a", "b", "c", "d"],
      dislikes: ["b"],
      dietaryRestrictionIds: [],
    };
    expect(effectiveLikes(ordered)).toEqual(["a", "c", "d"]);
  });
});
