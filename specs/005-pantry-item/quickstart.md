# Quickstart: Pantry Items

**Feature**: `005-pantry-item` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+
- Existing Meal Pilot service foundation (`001`–`004`) including Ingredient
  catalog + unit catalog

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
# Ensure a catalog ingredient exists (default unit tbsp)
curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Olive oil",
    "defaultUnitId": "tbsp",
    "shoppingCategoryId": "dry_goods",
    "aliases": []
  }' | jq

ING_ID=$(curl -s http://localhost:3000/ingredients | jq -r '.items[] | select(.displayName=="Olive oil") | .id')

# Create pantry stock (unit must match Ingredient default)
curl -s -X POST http://localhost:3000/pantry-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$ING_ID\",
    \"quantity\": 12.5,
    \"unitId\": \"tbsp\",
    \"expirationDate\": \"2026-12-01\"
  }" | jq

PANTRY_ID=$(curl -s http://localhost:3000/pantry-items | jq -r '.items[0].id')

# List pantry (A–Z by ingredient display name)
curl -s http://localhost:3000/pantry-items | jq

# Get detail
curl -s "http://localhost:3000/pantry-items/$PANTRY_ID" | jq

# Full replace — clear expiration
curl -s -X PUT "http://localhost:3000/pantry-items/$PANTRY_ID" \
  -H 'content-type: application/json' \
  -d '{
    "quantity": 10,
    "unitId": "tbsp",
    "expirationDate": null
  }' | jq

# Reject unit mismatch (cup ≠ tbsp default)
curl -s -X POST http://localhost:3000/pantry-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$ING_ID\",
    \"quantity\": 1,
    \"unitId\": \"cup\"
  }" | jq

# Reject duplicate Ingredient stock
curl -s -X POST http://localhost:3000/pantry-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$ING_ID\",
    \"quantity\": 1,
    \"unitId\": \"tbsp\"
  }" | jq

# Reject Ingredient delete while stocked
curl -s -X DELETE "http://localhost:3000/ingredients/$ING_ID" | jq

# Remove pantry stock, then Ingredient delete succeeds
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  "http://localhost:3000/pantry-items/$PANTRY_ID"

curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  "http://localhost:3000/ingredients/$ING_ID"
```

## Expected results

| Step | Expect |
|------|--------|
| POST valid pantry item | `201`; quantity `12.5`; `expirationDate` `2026-12-01`; `ingredientDisplayName` present |
| GET list | Items A–Z by `ingredientDisplayName`; `maxPantryItems` `500` |
| PUT clear expiration | `200`; `expirationDate` `null`; quantity `10` |
| POST wrong unit | `400` `UNIT_MISMATCH` |
| POST duplicate Ingredient | `409` `PANTRY_INGREDIENT_CONFLICT` |
| DELETE Ingredient while stocked | `409` `INGREDIENT_IN_USE` |
| DELETE pantry then Ingredient | `204` then `204` |
| Restart `npm run dev` | Prior pantry rows (if any remain) still list/get |

## Out of scope smoke

UpdatePantry from grocery confirmation, grocery list subtraction, multi-lot
stock, and unit conversion remain future features.
