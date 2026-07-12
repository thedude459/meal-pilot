# Quickstart: Recipes

**Feature**: `003-recipe` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+
- Existing Meal Pilot service foundation (`001` / `002` schema + dietary catalog)

## Setup

```bash
npm install
npm run db:migrate
npm run dev
```

API listens on `http://localhost:3000` by default. SQLite file defaults to
`./data/meal-pilot.sqlite`.

## Smoke script

With the server running:

```bash
# Unit catalog
curl -s http://localhost:3000/ingredient-units | jq

# Dietary catalog (reuse; tags on recipes use these ids)
curl -s http://localhost:3000/dietary-restrictions | jq

# Create curated recipe (duplicate dietary ids collapse; decimals OK)
curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Weeknight Pasta",
    "ingredients": [
      { "name": "pasta", "quantity": 12, "unitId": "oz" },
      { "name": "olive oil", "quantity": 1.5, "unitId": "tbsp" }
    ],
    "instructionSteps": [
      "Boil pasta until al dente.",
      "Toss with olive oil and serve."
    ],
    "servings": 4,
    "prepTimeMinutes": 5,
    "cookTimeMinutes": 15,
    "cuisineTags": ["Italian", "italian", "weeknight"],
    "dietaryAttributeIds": ["vegetarian", "vegetarian", "nut_free"]
  }' | jq

RECIPE_ID=$(curl -s http://localhost:3000/recipes | jq -r '.items[0].id')

# List library
curl -s http://localhost:3000/recipes | jq

# Get detail (source must be curated)
curl -s "http://localhost:3000/recipes/$RECIPE_ID" | jq

# Full replace
curl -s -X PUT "http://localhost:3000/recipes/$RECIPE_ID" \
  -H 'content-type: application/json' \
  -d '{
    "title": "Weeknight Pasta",
    "ingredients": [
      { "name": "pasta", "quantity": 12, "unitId": "oz" },
      { "name": "garlic", "quantity": 2, "unitId": "clove" }
    ],
    "instructionSteps": ["Boil pasta.", "Add garlic oil."],
    "cuisineTags": ["Italian"],
    "dietaryAttributeIds": ["vegetarian"]
  }' | jq

# Reject unknown unit
curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Bad Unit",
    "ingredients": [{ "name": "flour", "quantity": 1, "unitId": "not_a_unit" }],
    "instructionSteps": ["Mix."]
  }' | jq

# Reject unknown dietary tag
curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Bad Tag",
    "ingredients": [{ "name": "rice", "quantity": 1, "unitId": "cup" }],
    "instructionSteps": ["Cook."],
    "dietaryAttributeIds": ["not_a_real_restriction"]
  }' | jq

# Permanent delete (UI confirms before this call)
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  "http://localhost:3000/recipes/$RECIPE_ID"
```

## Expected results

| Step | Expect |
|------|--------|
| GET units | `200` with catalog ids including `cup`, `tbsp`, `oz`, … |
| POST valid recipe | `201`; `source` = `curated`; cuisine `["Italian","weeknight"]`; dietary `["vegetarian","nut_free"]`; oil quantity `1.5` |
| GET list / detail | Same title/ingredients/steps order; `source` curated |
| PUT replace | `200`; garlic line present; prior oil line gone |
| POST unknown unit | `400` `UNKNOWN_UNIT`; no new recipe |
| POST unknown dietary | `400` `UNKNOWN_RESTRICTION`; no new recipe |
| POST when library already has 500 | `409` `RECIPE_LIBRARY_FULL`; count unchanged |
| DELETE | `204`; recipe absent from list |
| Restart server | Remaining recipes still present |

## Tests

```bash
npm test
```

Prefer suites under `tests/unit/recipe.test.ts`,
`tests/unit/ingredient-units.test.ts`,
`tests/integration/recipe.integration.test.ts`, and
`tests/contract/recipes.contract.test.ts` once authored.

## Speckit alignment

Normalization, limits, unit/dietary catalog checks, and shared schema types live
in `src/domain/recipe.ts` and `src/domain/ingredient-units.ts` plus
`RecipeService` use cases. HTTP routes must not re-implement those rules. AI
generation and meal-plan linking remain future modules that must emit/consume
the same Recipe shape.
