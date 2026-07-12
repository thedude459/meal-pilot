import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../../src/db/client.js";
import { ErrorCode } from "../../src/domain/errors.js";
import { DIETARY_RESTRICTIONS } from "../../src/domain/dietary-restrictions.js";
import { FamilyMemberService } from "../../src/services/family-member-service.js";

describe("preference-profile integration", () => {
  let handle: DbHandle;
  let service: FamilyMemberService;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-"));
    handle = createDb(join(dir, "test.sqlite"));
    runMigrations(handle.sqlite);
    service = new FamilyMemberService(handle.db);
  });

  afterEach(() => {
    handle.sqlite.close();
  });

  it("replacePreferences normalizes and persists", () => {
    const member = service.createFamilyMember("Alex");
    const saved = service.replacePreferences(member.id, {
      likes: ["pasta", "Pasta", "tacos"],
      dislikes: ["olives", "pasta"],
      dietaryRestrictionIds: ["gluten_free", "gluten_free", "nut_free"],
    });
    expect(saved).toEqual({
      likes: ["pasta", "tacos"],
      dislikes: ["olives", "pasta"],
      dietaryRestrictionIds: ["gluten_free", "nut_free"],
    });
    expect(service.getPreferences(member.id)).toEqual(saved);
  });

  it("rejects unknown restriction and leaves prior profile unchanged", () => {
    const member = service.createFamilyMember("Blair");
    service.replacePreferences(member.id, {
      likes: ["rice"],
      dislikes: [],
      dietaryRestrictionIds: ["vegan"],
    });
    try {
      service.replacePreferences(member.id, {
        likes: ["changed"],
        dislikes: [],
        dietaryRestrictionIds: ["not_a_real_restriction"],
      });
      expect.fail("expected UNKNOWN_RESTRICTION");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.UNKNOWN_RESTRICTION);
    }
    expect(service.getPreferences(member.id)).toEqual({
      likes: ["rice"],
      dislikes: [],
      dietaryRestrictionIds: ["vegan"],
    });
  });

  it("rejects over-limit labels and leaves prior profile unchanged", () => {
    const member = service.createFamilyMember("Casey");
    service.replacePreferences(member.id, {
      likes: ["ok"],
      dislikes: [],
      dietaryRestrictionIds: [],
    });
    try {
      service.replacePreferences(member.id, {
        likes: ["x".repeat(41)],
        dislikes: [],
        dietaryRestrictionIds: [],
      });
      expect.fail("expected PREFERENCE_LIMIT");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.PREFERENCE_LIMIT);
    }
    expect(service.getPreferences(member.id).likes).toEqual(["ok"]);
  });

  it("returns empty preferences for new members and lists catalog", () => {
    const member = service.createFamilyMember("Drew");
    expect(service.getPreferences(member.id)).toEqual({
      likes: [],
      dislikes: [],
      dietaryRestrictionIds: [],
    });
    expect(DIETARY_RESTRICTIONS.length).toBeGreaterThan(0);
    expect(DIETARY_RESTRICTIONS[0]).toHaveProperty("id");
    expect(DIETARY_RESTRICTIONS[0]).toHaveProperty("label");
  });

  it("keeps profiles isolated and exposes effective preferences", () => {
    const a = service.createFamilyMember("Alex");
    const b = service.createFamilyMember("Blair");
    service.replacePreferences(a.id, {
      likes: ["pasta", "tacos"],
      dislikes: ["pasta"],
      dietaryRestrictionIds: ["gluten_free"],
    });
    service.replacePreferences(b.id, {
      likes: ["sushi"],
      dislikes: [],
      dietaryRestrictionIds: ["nut_free"],
    });
    expect(service.getPreferences(b.id).likes).toEqual(["sushi"]);
    expect(service.getEffectivePreferences(a.id)).toEqual({
      effectiveLikes: ["tacos"],
      effectiveDislikes: ["pasta"],
      hardRestrictions: ["gluten_free"],
    });
  });

  it("delete member removes preferences", () => {
    const member = service.createFamilyMember("Evan");
    service.replacePreferences(member.id, {
      likes: ["bread"],
      dislikes: [],
      dietaryRestrictionIds: [],
    });
    service.deleteFamilyMember(member.id);
    try {
      service.getPreferences(member.id);
      expect.fail("expected NOT_FOUND");
    } catch (err) {
      expect((err as { code: string }).code).toBe(ErrorCode.NOT_FOUND);
    }
  });
});
