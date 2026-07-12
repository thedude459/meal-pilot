# Quickstart: Grocery Items

**Feature**: `006-grocery-item` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+
- Existing Meal Pilot service foundation (`001`–`005`) including Ingredient
  catalog, unit catalog, shopping-categories, and PantryItem module

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
# Ensure catalog ingredients exist (different categories)
curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Olive oil",
    "defaultUnitId": "tbsp",
    "shoppingCategoryId": "dry_goods",
    "aliases": []
  }' | jq

curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Milk",
    "defaultUnitId": "cup",
    "shoppingCategoryId": "dairy",
    "aliases": []
  }' | jq

OIL_ID=$(curl -s http://localhost:3000/ingredients | jq -r '.items[] | select(.displayName=="Olive oil") | .id')
MILK_ID=$(curl -s http://localhost:3000/ingredients | jq -r '.items[] | select(.displayName=="Milk") | .id')

# Create grocery lines (unit must match Ingredient default; starts unchecked)
curl -s -X POST http://localhost:3000/grocery-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$OIL_ID\",
    \"quantity\": 2.5,
    \"unitId\": \"tbsp\"
  }" | jq

curl -s -X POST http://localhost:3000/grocery-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$MILK_ID\",
    \"quantity\": 1,
    \"unitId\": \"cup\"
  }" | jq

# List grocery (groups in catalog order; dairy before dry_goods)
curl -s http://localhost:3000/grocery-items | jq

OIL_GI=$(curl -s http://localhost:3000/grocery-items | jq -r '
  .groups[].items[] | select(.ingredientDisplayName=="Olive oil") | .id')

# Get detail
curl -s "http://localhost:3000/grocery-items/$OIL_GI" | jq

# Full replace quantity/unit (checked unchanged)
curl -s -X PUT "http://localhost:3000/grocery-items/$OIL_GI" \
  -H 'content-type: application/json' \
  -d '{
    "quantity": 3,
    "unitId": "tbsp"
  }' | jq

# Check off purchased
curl -s -X PUT "http://localhost:3000/grocery-items/$OIL_GI/checked" \
  -H 'content-type: application/json' \
  -d '{ "checked": true }' | jq

# Reject unit mismatch
curl -s -X POST http://localhost:3000/grocery-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$MILK_ID\",
    \"quantity\": 1,
    \"unitId\": \"tbsp\"
  }" | jq

# Reject duplicate Ingredient line
curl -s -X POST http://localhost:3000/grocery-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$OIL_ID\",
    \"quantity\": 1,
    \"unitId\": \"tbsp\"
  }" | jq

# Reject Ingredient delete while on grocery list
curl -s -X DELETE "http://localhost:3000/ingredients/$OIL_ID" | jq

# Remove grocery line, then Ingredient delete succeeds (if not in pantry)
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  "http://localhost:3000/grocery-items/$OIL_GI"

curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  "http://localhost:3000/ingredients/$OIL_ID"
```

## Expected results

| Step | Expect |
|------|--------|
| POST valid grocery item | `201`; quantity as sent (≤3 decimals); `checked` `false`; category fields present |
| GET list | `groups` in catalog order (e.g. dairy before dry_goods); A–Z within group; `maxGroceryItems` `500` |
| PUT quantity/unit | `200`; quantity `3`; `checked` still prior value |
| PUT .../checked | `200`; `checked` `true`; quantity unchanged |
| POST wrong unit | `400` `UNIT_MISMATCH` |
| POST duplicate Ingredient | `409` `GROCERY_INGREDIENT_CONFLICT` |
| DELETE Ingredient while listed | `409` `INGREDIENT_IN_USE` |
| DELETE grocery then Ingredient | `204` then `204` |
| Restart `npm run dev` | Prior grocery rows (if any remain) still list/get |

## Out of scope smoke

BuildGroceryList from WeeklyPlan, pantry subtraction during generation,
UpdatePantry from confirmation, export, quantity-merge on duplicate add, and
bulk clear of checked items remain future features.
