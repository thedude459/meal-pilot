# Quickstart: Recipe Hybrid Engine

**Feature**: `012-recipe-hybrid-engine` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+
- Existing Meal Pilot stack through `011` (FamilyMember, PreferenceProfile,
  Recipe, MealSuggestionEngine)

RecipeHybridEngine has **no new HTTP routes**. Smoke uses the in-process
`RecipeHybridService` with a stub `RecipeAiGenerator` (no live AI provider
required).

## Setup

```bash
npm install
npm run db:migrate
```

## Programmatic smoke (after implementation)

Use the Vitest integration suite as the primary smoke (recommended):

```bash
npm test -- tests/integration/recipe-hybrid-engine.integration.test.ts
```

Or exercise the service from a short script against a migrated DB:

```ts
import { RecipeHybridService } from "./src/services/recipe-hybrid-service.js";
// After createDb + runMigrations + seed member/prefs…

const stubGenerator = {
  async generate() {
    return {
      title: "AI Chicken Bowl",
      ingredients: [
        { name: "Chicken", quantity: 1, unitId: "lb" },
        { name: "Rice", quantity: 2, unitId: "cup" },
      ],
      instructionSteps: ["Cook rice", "Cook chicken", "Combine"],
      dietaryAttributeIds: ["gluten_free"],
      cuisineTags: ["american"],
    };
  },
};

const hybrid = new RecipeHybridService(db, { generator: stubGenerator });
const result = await hybrid.generateRecipe({ seasonalGuidance: "summer" });
console.log({
  acceptedCount: result.acceptedCount,
  source: result.accepted[0]?.source,
  title: result.accepted[0]?.title,
});
```

## Expected checks

1. `acceptedCount === 1` and `accepted[0].source === "ai"`.
2. Recipe appears via `RecipeService.listFullRecipes()`.
3. Stub candidate missing `gluten_free` / with a dislike → after ≤3 attempts,
   `unmetCount === 1` and library unchanged for that slot.
4. `substituteIngredient` on a curated recipe with `mode: "replace-in-place"`
   → `HYBRID_REPLACE_CURATED_FORBIDDEN`; curated row unchanged.
5. `hybridFill({ count: 2 })` with stub → two AI recipes or explicit unmet
   reasons (no silent empty success).

## Tests

```bash
npm test -- tests/unit/recipe-hybrid.test.ts
npm test -- tests/integration/recipe-hybrid-engine.integration.test.ts
npm test -- tests/contract/recipe-hybrid-engine.contract.test.ts
```

## Out of scope for smoke

- Live model provider calls
- GenerateWeeklyMeals auto-fill wiring
- Organizer-facing generate/substitute HTTP
