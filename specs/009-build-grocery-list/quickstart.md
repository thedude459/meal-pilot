# Quickstart: Build Grocery List

**Feature**: `009-build-grocery-list` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+
- Existing Meal Pilot service (`001`–`008`) including Ingredient catalog,
  Recipe, PantryItem, GroceryItem, WeeklyPlan, and GenerateWeeklyMeals
  (or manual plan fill + approve)

## Setup

```bash
npm install
npm run db:migrate
npm run dev
```

API listens on `http://localhost:3000` by default. SQLite file defaults to
`./data/meal-pilot.sqlite`.

## Smoke script

With the server running, seed catalog + recipes + plan approvals, then build:

```bash
# Catalog ingredients (names must match recipe lines for auto-merge)
curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Chicken thighs",
    "defaultUnitId": "lb",
    "shoppingCategoryId": "meat"
  }' | jq

curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Olive oil",
    "defaultUnitId": "tbsp",
    "shoppingCategoryId": "pantry",
    "aliases": ["EVOO"]
  }' | jq

CHICKEN_ID=$(curl -s http://localhost:3000/ingredients | jq -r '
  .items[] | select(.displayName=="Chicken thighs") | .id')
OIL_ID=$(curl -s http://localhost:3000/ingredients | jq -r '
  .items[] | select(.displayName=="Olive oil") | .id')

# Partial pantry cover for oil (available); optional expired row ignored
curl -s -X POST http://localhost:3000/pantry-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$OIL_ID\",
    \"quantity\": 1,
    \"unitId\": \"tbsp\"
  }" | jq

# Recipes whose ingredient names match catalog
curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Sheet-pan chicken",
    "ingredients": [
      { "name": "Chicken thighs", "quantity": 1.5, "unitId": "lb" },
      { "name": "Olive oil", "quantity": 2, "unitId": "tbsp" }
    ],
    "instructionSteps": ["Roast until done."]
  }' | jq

curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Garlic chicken",
    "ingredients": [
      { "name": "Chicken thighs", "quantity": 1, "unitId": "lb" },
      { "name": "Mystery spice", "quantity": 1, "unitId": "tsp" }
    ],
    "instructionSteps": ["Cook."]
  }' | jq

# Create/generate a Monday plan and approve two days (use .plan.id from generate)
WEEK=2026-07-13
PLAN_ID=$(curl -s -X POST http://localhost:3000/weekly-plans/generate \
  -H 'content-type: application/json' \
  -d "{ \"weekStartDate\": \"$WEEK\" }" | jq -r '.plan.id')

curl -s -X PUT \
  "http://localhost:3000/weekly-plans/$PLAN_ID/slots/monday/status" \
  -H 'content-type: application/json' \
  -d '{ "status": "approved" }' | jq

curl -s -X PUT \
  "http://localhost:3000/weekly-plans/$PLAN_ID/slots/tuesday/status" \
  -H 'content-type: application/json' \
  -d '{ "status": "approved" }' | jq

# Build grocery list from approved meals
curl -s -X POST http://localhost:3000/grocery-items/build \
  -H 'content-type: application/json' \
  -d "{ \"weekStartDate\": \"$WEEK\" }" | jq

# Expect: chicken merged qty; oil shortfall after pantry; unmatched Mystery spice
curl -s http://localhost:3000/grocery-items | jq

# Check one item, rebuild — checked unchanged; shortfall reported if need higher
ITEM_ID=$(curl -s http://localhost:3000/grocery-items | jq -r '
  .groups[].items[] | select(.ingredientDisplayName=="Chicken thighs") | .id')

curl -s -X PUT "http://localhost:3000/grocery-items/$ITEM_ID/checked" \
  -H 'content-type: application/json' \
  -d '{ "checked": true }' | jq

curl -s -X POST http://localhost:3000/grocery-items/build \
  -H 'content-type: application/json' \
  -d "{ \"weekStartDate\": \"$WEEK\" }" | jq

# Manual add outside plan — should survive rebuild
curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Paper towels",
    "defaultUnitId": "piece",
    "shoppingCategoryId": "other"
  }' | jq

PAPER_ID=$(curl -s http://localhost:3000/ingredients | jq -r '
  .items[] | select(.displayName=="Paper towels") | .id')

curl -s -X POST http://localhost:3000/grocery-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$PAPER_ID\",
    \"quantity\": 1,
    \"unitId\": \"piece\"
  }" | jq

curl -s -X POST http://localhost:3000/grocery-items/build \
  -H 'content-type: application/json' \
  -d "{ \"weekStartDate\": \"$WEEK\" }" | jq

# Validation: non-Monday / zero approved / missing plan
curl -s -X POST http://localhost:3000/grocery-items/build \
  -H 'content-type: application/json' \
  -d '{ "weekStartDate": "2026-07-14" }' | jq
```

## Expected results

| Step | Expect |
|------|--------|
| Build with ≥1 approved + matched ingredients | `200`; `groups` contain merged net needs; pantry shortfall only |
| Shared ingredient across approved days | Single grocery line with summed quantity (minus pantry) |
| Unmatched recipe name | Listed in `report.unmatched`; no auto grocery line |
| Fully pantry-covered ingredient | Not an unchecked buy line; may appear in `report.pantryCovered` |
| Checked then rebuild | Checked row unchanged; `report.checkedSkips` includes remainingShortfall when need &gt; checked qty |
| Manual out-of-set unchecked add | Still present after rebuild |
| Non-Monday weekStart | `400` `VALIDATION_ERROR` |
| Plan with zero approved | `400` `BUILD_NO_APPROVED_MEALS` |
| Unknown week | `404` `NOT_FOUND` |

## Out of scope checks

Confirm this feature does **not** export to external services, mutate pantry
quantities (UpdatePantry), convert units, or scale by Recipe servings.
