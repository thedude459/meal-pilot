# Quickstart: Ingredients

**Feature**: `004-ingredient` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+
- Existing Meal Pilot service foundation (`001`–`003` schema + unit catalog)

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
# Unit catalog (owned by Recipes feature; reused here)
curl -s http://localhost:3000/ingredient-units | jq

# Shopping-category catalog
curl -s http://localhost:3000/shopping-categories | jq

# Create ingredient (extra spaces normalize; duplicate alias collapses)
curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "  Olive   oil  ",
    "defaultUnitId": "tbsp",
    "shoppingCategoryId": "dry_goods",
    "aliases": ["EVOO", "evoo", "extra virgin olive oil"]
  }' | jq

ING_ID=$(curl -s http://localhost:3000/ingredients | jq -r '.items[0].id')

# List catalog (A–Z)
curl -s http://localhost:3000/ingredients | jq

# Get detail
curl -s "http://localhost:3000/ingredients/$ING_ID" | jq

# Full replace — clear shopping category
curl -s -X PUT "http://localhost:3000/ingredients/$ING_ID" \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Olive oil",
    "defaultUnitId": "tbsp",
    "shoppingCategoryId": null,
    "aliases": ["EVOO", "extra virgin olive oil"]
  }' | jq

# Reject unknown unit
curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Flour",
    "defaultUnitId": "not_a_unit"
  }' | jq

# Reject unknown shopping category
curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Flour",
    "defaultUnitId": "cup",
    "shoppingCategoryId": "not_a_category"
  }' | jq

# Reject label conflict (alias equals display name)
curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Butter",
    "defaultUnitId": "tbsp",
    "aliases": ["butter"]
  }' | jq

# Reject duplicate display name (normalized)
curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "olive oil",
    "defaultUnitId": "cup"
  }' | jq

# Permanent delete (UI confirms before this call)
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  "http://localhost:3000/ingredients/$ING_ID"
```

## Expected results

| Step | Expect |
|------|--------|
| GET units | `200` with catalog ids including `cup`, `tbsp`, … |
| GET shopping categories | `200` with ids including `produce`, `dairy`, `dry_goods`, … |
| POST valid ingredient | `201`; `displayName` = `"Olive oil"`; aliases `["EVOO","extra virgin olive oil"]`; category `dry_goods` |
| GET list / detail | Same fields; list A–Z by displayName |
| PUT clear category | `200`; `shoppingCategoryId` = `null` |
| POST unknown unit | `400` `UNKNOWN_UNIT`; no new ingredient |
| POST unknown category | `400` `UNKNOWN_SHOPPING_CATEGORY`; no new ingredient |
| POST alias = name | `409` `INGREDIENT_LABEL_CONFLICT`; no new ingredient |
| POST duplicate name | `409` `INGREDIENT_LABEL_CONFLICT`; no new ingredient |
| POST when catalog already has 500 | `409` `INGREDIENT_CATALOG_FULL`; count unchanged |
| DELETE | `204`; ingredient absent from list |
| Restart server | Remaining ingredients still present |

## Tests

```bash
npm test
```

Prefer suites under `tests/unit/ingredient.test.ts`,
`tests/unit/shopping-categories.test.ts`,
`tests/integration/ingredient.integration.test.ts`, and
`tests/contract/ingredients.contract.test.ts` once authored.

## Speckit alignment

Normalization, uniqueness, limits, and shopping-category checks live in
`src/domain/ingredient.ts` and `src/domain/shopping-categories.ts` plus
`IngredientService` use cases. HTTP routes must not re-implement those rules.
Recipe free-text lines, pantry quantities, and grocery generation remain future
or separate modules that consume Ingredient identity without changing this
catalog contract.
