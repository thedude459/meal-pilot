import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/api/app.js";
import { ErrorCode } from "../../src/domain/errors.js";
import {
  HYBRID_FAILURE_REASONS,
  MAX_GENERATION_ATTEMPTS_PER_SLOT,
} from "../../src/domain/recipe-hybrid.js";
import { RecipeHybridService } from "../../src/services/recipe-hybrid-service.js";

describe("recipe-hybrid-engine service contract (012)", () => {
  const contractPath = join(
    process.cwd(),
    "specs/012-recipe-hybrid-engine/contracts/recipe-hybrid-engine.service.yaml",
  );
  const contract = readFileSync(contractPath, "utf8");

  it("exposes generateRecipe, hybridFill, substituteIngredient on RecipeHybridService", () => {
    expect(typeof RecipeHybridService.prototype.generateRecipe).toBe("function");
    expect(typeof RecipeHybridService.prototype.hybridFill).toBe("function");
    expect(typeof RecipeHybridService.prototype.substituteIngredient).toBe("function");
    expect(contract).toContain("generateRecipe:");
    expect(contract).toContain("hybridFill:");
    expect(contract).toContain("substituteIngredient:");
  });

  it("contract declares no new HTTP paths", () => {
    expect(contract).toMatch(/newPaths:\s*\[\]/);
  });

  it("failure reason enums and retry budget match contract", () => {
    expect(MAX_GENERATION_ATTEMPTS_PER_SLOT).toBe(3);
    expect(contract).toContain("maxAttemptsPerSlot: 3");
    for (const reason of HYBRID_FAILURE_REASONS) {
      expect(contract).toContain(reason);
    }
    expect(ErrorCode.HYBRID_GENERATION_FAILED).toBe("HYBRID_GENERATION_FAILED");
    expect(ErrorCode.HYBRID_REPLACE_CURATED_FORBIDDEN).toBe(
      "HYBRID_REPLACE_CURATED_FORBIDDEN",
    );
  });

  it("substituteIngredient requires structured replacement in contract", () => {
    expect(contract).toContain("replacement:");
    expect(contract).toMatch(/replacement:[\s\S]*required:\s*true/);
    expect(contract).toContain("ingredientsPerRequest: 1");
  });

  it("optional soft guidance fields are documented", () => {
    expect(contract).toContain("seasonalGuidance:");
    expect(contract).toContain("budgetGuidance:");
  });

  it("no hybrid/generate HTTP routes are mounted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "meal-pilot-rhe-contract-"));
    const app = createApp(join(dir, "test.sqlite"));
    for (const path of [
      "/recipes/generate",
      "/recipes/hybrid",
      "/hybrid/fill",
      "/recipe-hybrid",
    ]) {
      const res = await app.request(path, { method: "POST" });
      expect(res.status).toBe(404);
    }
  });
});
