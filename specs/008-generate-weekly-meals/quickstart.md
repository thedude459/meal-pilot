# Quickstart: Generate Weekly Meals

**Feature**: `008-generate-weekly-meals` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+
- Existing Meal Pilot service (`001`–`007`) including FamilyMember,
  PreferenceProfile, Recipe, PantryItem, and WeeklyPlan

## Setup

```bash
npm install
npm run db:migrate
npm run dev
```

API listens on `http://localhost:3000` by default. SQLite file defaults to
`./data/meal-pilot.sqlite`.

## Smoke script

With the server running, seed preferences and recipes, then generate:

```bash
# Family member + preferences (hard dislike + dietary tag)
curl -s -X POST http://localhost:3000/family-members \
  -H 'content-type: application/json' \
  -d '{ "name": "Alex" }' | jq

MEMBER_ID=$(curl -s http://localhost:3000/family-members | jq -r '
  .items[] | select(.name=="Alex") | .id')

curl -s -X PUT "http://localhost:3000/family-members/$MEMBER_ID/preferences" \
  -H 'content-type: application/json' \
  -d '{
    "likes": ["chicken"],
    "dislikes": ["anchovy"],
    "dietaryRestrictionIds": ["gluten_free"]
  }' | jq

# Safe recipe (has gluten_free tag; no anchovy)
curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Sheet-pan chicken",
    "ingredients": [
      { "name": "Chicken thighs", "quantity": 1.5, "unitId": "lb" }
    ],
    "instructionSteps": ["Roast until done."],
    "prepTimeMinutes": 15,
    "cookTimeMinutes": 35,
    "cuisineTags": ["weeknight"],
    "dietaryAttributeIds": ["gluten_free"]
  }' | jq

# Unsafe: missing gluten_free
curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Wheat pasta",
    "ingredients": [
      { "name": "Spaghetti", "quantity": 12, "unitId": "oz" }
    ],
    "instructionSteps": ["Boil pasta."],
    "dietaryAttributeIds": []
  }' | jq

# Unsafe: dislike match on ingredient
curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Caesar-ish salad",
    "ingredients": [
      { "name": "Anchovy fillets", "quantity": 4, "unitId": "piece" }
    ],
    "instructionSteps": ["Toss."],
    "dietaryAttributeIds": ["gluten_free"]
  }' | jq

# Second safe recipe for reject→alternative
curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Grilled salmon",
    "ingredients": [
      { "name": "Salmon", "quantity": 1, "unitId": "lb" }
    ],
    "instructionSteps": ["Grill."],
    "prepTimeMinutes": 10,
    "cookTimeMinutes": 12,
    "cuisineTags": ["seafood"],
    "dietaryAttributeIds": ["gluten_free"]
  }' | jq

# Generate for a Monday week-start (creates plan; fill-empty default)
curl -s -X POST http://localhost:3000/weekly-plans/generate \
  -H 'content-type: application/json' \
  -d '{ "weekStartDate": "2026-07-13" }' | jq

# Inspect: only safe recipes; pending statuses; report.unfilledDays if thin library
PLAN_ID=$(curl -s -X POST http://localhost:3000/weekly-plans/generate \
  -H 'content-type: application/json' \
  -d '{ "weekStartDate": "2026-07-13" }' | jq -r '.plan.id')

curl -s "http://localhost:3000/weekly-plans/$PLAN_ID" | jq

# Approve Monday
curl -s -X PUT \
  "http://localhost:3000/weekly-plans/$PLAN_ID/slots/monday/status" \
  -H 'content-type: application/json' \
  -d '{ "status": "approved" }' | jq

# Reject Tuesday → alternativeOutcome.applied true/false
curl -s -X PUT \
  "http://localhost:3000/weekly-plans/$PLAN_ID/slots/tuesday/status" \
  -H 'content-type: application/json' \
  -d '{ "status": "rejected" }' | jq

# fill-empty again: must not change approved Monday
curl -s -X POST http://localhost:3000/weekly-plans/generate \
  -H 'content-type: application/json' \
  -d '{ "weekStartDate": "2026-07-13", "mode": "fill-empty" }' | jq

# regenerate-non-approved: refreshes empty/pending/rejected; keeps approved
curl -s -X POST http://localhost:3000/weekly-plans/generate \
  -H 'content-type: application/json' \
  -d '{
    "weekStartDate": "2026-07-13",
    "mode": "regenerate-non-approved"
  }' | jq

# Validation: non-Monday
curl -s -X POST http://localhost:3000/weekly-plans/generate \
  -H 'content-type: application/json' \
  -d '{ "weekStartDate": "2026-07-14" }' | jq
```

## Expected results

| Step | Expect |
|------|--------|
| Generate with preferences + safe recipes | `200`; `plan.weekStartDate` Monday; filled slots `pending`; unsafe recipes never slotted |
| Thin library | `200`; `report.unfilledDays` with `NO_SAFE_CANDIDATES`; no AI recipes created |
| Approve then fill-empty | Approved day unchanged |
| Reject with ≥1 alt | Day becomes different Recipe, `pending`; `alternativeOutcome.applied: true` |
| Reject with no alt | Day stays `rejected`; `alternativeOutcome.applied: false` |
| Non-Monday weekStart | `400` `VALIDATION_ERROR` |
| No family members | `400` `GENERATION_NO_PREFERENCES` |

## Out of scope checks

Confirm this feature does **not** expose AI recipe generation, grocery list
build from approved meals, pantry quantity updates, or a day-subset generate
parameter.
