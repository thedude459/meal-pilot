import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ErrorCode } from "../../src/domain/errors.js";
import {
  GENERATION_MODES,
  type AlternativeOutcome,
  type UnfilledReason,
} from "../../src/domain/meal-suggestion.js";
import { MealSuggestionService } from "../../src/services/meal-suggestion-service.js";
import { createApp } from "../../src/api/app.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

describe("meal-suggestion-engine service contract (011)", () => {
  const contractPath = join(
    process.cwd(),
    "specs/011-meal-suggestion-engine/contracts/meal-suggestion-engine.service.yaml",
  );
  const contract = readFileSync(contractPath, "utf8");

  it("exposes generateWeeklyMeals and rejectWithAlternative on MealSuggestionService", () => {
    expect(typeof MealSuggestionService.prototype.generateWeeklyMeals).toBe("function");
    expect(typeof MealSuggestionService.prototype.rejectWithAlternative).toBe("function");
    expect(contract).toContain("generateWeeklyMeals:");
    expect(contract).toContain("rejectWithAlternative:");
  });

  it("GENERATION_MODES match contract enums", () => {
    expect([...GENERATION_MODES]).toEqual(["fill-empty", "regenerate-non-approved"]);
    expect(contract).toContain("fill-empty");
    expect(contract).toContain("regenerate-non-approved");
  });

  it("unfilled and alternative reason enums match contract", () => {
    const unfilled: UnfilledReason = "NO_SAFE_CANDIDATES";
    const applied: AlternativeOutcome = { applied: true };
    const failed: AlternativeOutcome = { applied: false, reason: "NO_SAFE_ALTERNATIVE" };
    expect(unfilled).toBe("NO_SAFE_CANDIDATES");
    expect(applied.applied).toBe(true);
    expect(failed).toEqual({ applied: false, reason: "NO_SAFE_ALTERNATIVE" });
    expect(contract).toContain("NO_SAFE_CANDIDATES");
    expect(contract).toContain("NO_SAFE_ALTERNATIVE");
  });

  it("contract declares no new HTTP paths and existing consumers", () => {
    expect(contract).toMatch(/newPaths:\s*\[\]/);
    expect(contract).toContain("POST /weekly-plans/generate");
    expect(contract).toContain("PUT /weekly-plans/{id}/slots/{day}/status");
  });

  it("zero FamilyMembers uses GENERATION_NO_PREFERENCES error code", () => {
    expect(ErrorCode.GENERATION_NO_PREFERENCES).toBe("GENERATION_NO_PREFERENCES");
    expect(contract).toContain("GENERATION_NO_PREFERENCES");
  });

  it("no standalone suggest HTTP route is mounted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-mse-contract-"));
    const app = createApp(join(dir, "test.sqlite"));
    for (const path of ["/suggest", "/meal-suggestions", "/weekly-plans/suggest"]) {
      const res = await app.request(path, { method: "POST" });
      expect(res.status).toBe(404);
    }
  });
});
