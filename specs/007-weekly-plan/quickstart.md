# Quickstart: Weekly Plans

**Feature**: `007-weekly-plan` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+
- Existing Meal Pilot service foundation (`001`–`006`) including Recipe library

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
# Ensure at least one curated recipe exists
curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Sheet-pan chicken",
    "ingredients": [
      { "name": "Chicken thighs", "quantity": 1.5, "unitId": "lb" }
    ],
    "instructionSteps": ["Roast at 425F until done."]
  }' | jq

RECIPE_ID=$(curl -s http://localhost:3000/recipes | jq -r '
  .items[] | select(.title=="Sheet-pan chicken") | .id')

# Create empty plan for a Monday week-start
curl -s -X POST http://localhost:3000/weekly-plans \
  -H 'content-type: application/json' \
  -d '{ "weekStartDate": "2026-07-13" }' | jq

# Create plan with initial slots (same Recipe on two days is allowed)
curl -s -X POST http://localhost:3000/weekly-plans \
  -H 'content-type: application/json' \
  -d "{
    \"weekStartDate\": \"2026-07-20\",
    \"slots\": [
      { \"day\": \"monday\", \"recipeId\": \"$RECIPE_ID\" },
      { \"day\": \"wednesday\", \"recipeId\": \"$RECIPE_ID\" }
    ]
  }" | jq

# List plans (newest week-start first)
curl -s http://localhost:3000/weekly-plans | jq

PLAN_ID=$(curl -s http://localhost:3000/weekly-plans | jq -r '
  .items[] | select(.weekStartDate=="2026-07-20") | .id')

# Get detail (seven days; empty days null)
curl -s "http://localhost:3000/weekly-plans/$PLAN_ID" | jq

# Assign Tuesday
curl -s -X PUT "http://localhost:3000/weekly-plans/$PLAN_ID/slots/tuesday" \
  -H 'content-type: application/json' \
  -d "{ \"recipeId\": \"$RECIPE_ID\" }" | jq

# Approve Monday
curl -s -X PUT \
  "http://localhost:3000/weekly-plans/$PLAN_ID/slots/monday/status" \
  -H 'content-type: application/json' \
  -d '{ "status": "approved" }' | jq

# Reject Wednesday
curl -s -X PUT \
  "http://localhost:3000/weekly-plans/$PLAN_ID/slots/wednesday/status" \
  -H 'content-type: application/json' \
  -d '{ "status": "rejected" }' | jq

# Clear Tuesday
curl -s -X DELETE \
  "http://localhost:3000/weekly-plans/$PLAN_ID/slots/tuesday" | jq

# Reject non-Monday week-start
curl -s -X POST http://localhost:3000/weekly-plans \
  -H 'content-type: application/json' \
  -d '{ "weekStartDate": "2026-07-14" }' | jq

# Reject duplicate week
curl -s -X POST http://localhost:3000/weekly-plans \
  -H 'content-type: application/json' \
  -d '{ "weekStartDate": "2026-07-20" }' | jq

# Reject status on empty slot
curl -s -X PUT \
  "http://localhost:3000/weekly-plans/$PLAN_ID/slots/friday/status" \
  -H 'content-type: application/json' \
  -d '{ "status": "approved" }' | jq

# Recipe delete blocked while referenced
curl -s -X DELETE "http://localhost:3000/recipes/$RECIPE_ID" | jq

# Delete plan then recipe can be removed
curl -s -X DELETE "http://localhost:3000/weekly-plans/$PLAN_ID" -w "%{http_code}\n"
EMPTY_PLAN=$(curl -s http://localhost:3000/weekly-plans | jq -r '
  .items[] | select(.weekStartDate=="2026-07-13") | .id')
curl -s -X DELETE "http://localhost:3000/weekly-plans/$EMPTY_PLAN" -w "%{http_code}\n"
curl -s -X DELETE "http://localhost:3000/recipes/$RECIPE_ID" -w "%{http_code}\n"
```

## Automated checks

```bash
npm test -- tests/unit/weekly-plan.test.ts \
  tests/integration/weekly-plan.integration.test.ts \
  tests/contract/weekly-plans.contract.test.ts
```

## Out of scope in this smoke

GenerateWeeklyMeals, post-reject alternatives, breakfast/lunch/dinner tracks,
BuildGroceryList from approved meals, preference/rotation scoring.
