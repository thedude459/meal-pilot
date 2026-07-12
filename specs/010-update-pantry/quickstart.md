# Quickstart: Update Pantry

**Feature**: `010-update-pantry` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+
- Existing Meal Pilot service (`001`–`009`) including Ingredient catalog,
  PantryItem, and GroceryItem (checked lines)

## Setup

```bash
npm install
npm run db:migrate
npm run dev
```

API listens on `http://localhost:3000` by default. SQLite file defaults to
`./data/meal-pilot.sqlite`.

## Smoke script

With the server running, seed catalog + pantry + checked groceries, then
preview and confirm:

```bash
# Catalog ingredients
curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Olive oil",
    "defaultUnitId": "tbsp",
    "shoppingCategoryId": "pantry"
  }' | jq

curl -s -X POST http://localhost:3000/ingredients \
  -H 'content-type: application/json' \
  -d '{
    "displayName": "Chicken thighs",
    "defaultUnitId": "lb",
    "shoppingCategoryId": "meat"
  }' | jq

OIL_ID=$(curl -s http://localhost:3000/ingredients | jq -r '
  .items[] | select(.displayName=="Olive oil") | .id')
CHICKEN_ID=$(curl -s http://localhost:3000/ingredients | jq -r '
  .items[] | select(.displayName=="Chicken thighs") | .id')

# Existing oil in pantry (will increase)
curl -s -X POST http://localhost:3000/pantry-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$OIL_ID\",
    \"quantity\": 2,
    \"unitId\": \"tbsp\"
  }" | jq

# Optional: expired stock to exercise removeExpired (use a past date)
curl -s -X POST http://localhost:3000/pantry-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$CHICKEN_ID\",
    \"quantity\": 0.5,
    \"unitId\": \"lb\",
    \"expirationDate\": \"2020-01-01\"
  }" | jq

# Grocery lines — check them after create
curl -s -X POST http://localhost:3000/grocery-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$OIL_ID\",
    \"quantity\": 3,
    \"unitId\": \"tbsp\"
  }" | jq

curl -s -X POST http://localhost:3000/grocery-items \
  -H 'content-type: application/json' \
  -d "{
    \"ingredientId\": \"$CHICKEN_ID\",
    \"quantity\": 1.5,
    \"unitId\": \"lb\"
  }" | jq

OIL_G=$(curl -s http://localhost:3000/grocery-items | jq -r '
  .groups[]?.items[]? // .items[]? | select(.ingredientId=="'"$OIL_ID"'") | .id' | head -1)
# Fallback if list shape uses groups:
OIL_G=${OIL_G:-$(curl -s http://localhost:3000/grocery-items | jq -r --arg id "$OIL_ID" '
  [ .. | objects | select(.ingredientId?==$id) | .id ][0]')}
CHICKEN_G=$(curl -s http://localhost:3000/grocery-items | jq -r --arg id "$CHICKEN_ID" '
  [ .. | objects | select(.ingredientId?==$id) | .id ][0]')

curl -s -X PUT "http://localhost:3000/grocery-items/$OIL_G/checked" \
  -H 'content-type: application/json' \
  -d '{"checked": true}' | jq

curl -s -X PUT "http://localhost:3000/grocery-items/$CHICKEN_G/checked" \
  -H 'content-type: application/json' \
  -d '{"checked": true}' | jq

# Preview with expired cleanup
curl -s -X POST http://localhost:3000/pantry-items/update/preview \
  -H 'content-type: application/json' \
  -d '{"removeExpired": true}' | jq

# Confirm
curl -s -X POST http://localhost:3000/pantry-items/update \
  -H 'content-type: application/json' \
  -d '{"removeExpired": true}' | jq

# Expect: oil increased (2+3), chicken created fresh (1.5) after expired removal,
# checked grocery lines gone, report.appliedCount == 2

curl -s http://localhost:3000/pantry-items | jq
curl -s http://localhost:3000/grocery-items | jq

# Second confirm should fail — no checked lines
curl -s -X POST http://localhost:3000/pantry-items/update \
  -H 'content-type: application/json' \
  -d '{}' | jq
```

## Acceptance checks

| Check | Expected |
|-------|----------|
| Preview `removeExpired: true` | Chicken expired in `expiredRemoved`; chicken action `created`; oil `increased` |
| Confirm | Same outcomes persisted; `report.appliedCount` = 2 |
| Pantry oil qty | 5 tbsp |
| Pantry chicken | 1.5 lb, `expirationDate` null |
| Grocery list | Applied checked lines absent |
| Second confirm | `400` `UPDATE_PANTRY_NO_CHECKED` |
| Confirm with zero checked + `removeExpired` | Still `400` `UPDATE_PANTRY_NO_CHECKED` |

## Tests

```bash
npm test -- tests/unit/pantry-manager.test.ts
npm test -- tests/integration/update-pantry.integration.test.ts
npm test -- tests/contract/update-pantry.contract.test.ts
```

## Out of scope reminders

Meal-cook pantry decrement, unit conversion, multi-lot stock, grocery rebuild,
and export are not part of this feature.
