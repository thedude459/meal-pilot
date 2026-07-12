# Quickstart: Meal Suggestion Engine

**Feature**: `011-meal-suggestion-engine` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+
- Existing Meal Pilot service through `008` (FamilyMember, PreferenceProfile,
  Recipe, PantryItem, WeeklyPlan, GenerateWeeklyMeals)

## Setup

```bash
npm install
npm run db:migrate
npm run dev
```

API listens on `http://localhost:3000` by default. MealSuggestionEngine has
**no new HTTP routes**; smoke uses the existing generate + reject paths that
consume the engine.

## Smoke script (engine via 008 consumers)

With the server running:

```bash
# Member + preferences
curl -s -X POST http://localhost:3000/family-members \
  -H 'content-type: application/json' \
  -d '{ "name": "Sam" }' | jq

MEMBER_ID=$(curl -s http://localhost:3000/family-members | jq -r '
  .items[] | select(.name=="Sam") | .id')

curl -s -X PUT "http://localhost:3000/family-members/$MEMBER_ID/preferences" \
  -H 'content-type: application/json' \
  -d '{
    "likes": ["chicken"],
    "dislikes": ["anchovy"],
    "dietaryRestrictionIds": ["gluten_free"]
  }' | jq

# Safe recipe
curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Chicken rice bowl",
    "ingredients": [
      { "name": "Chicken", "quantity": 1, "unitId": "lb" },
      { "name": "Rice", "quantity": 2, "unitId": "cup" }
    ],
    "steps": ["Cook rice", "Cook chicken", "Combine"],
    "dietaryAttributeIds": ["gluten_free"],
    "prepTimeMinutes": 10,
    "cookTimeMinutes": 25,
    "cuisineTags": ["american"]
  }' | jq

# Unsafe recipe (dislike + missing dietary tag)
curl -s -X POST http://localhost:3000/recipes \
  -H 'content-type: application/json' \
  -d '{
    "title": "Anchovy pasta",
    "ingredients": [
      { "name": "Anchovy", "quantity": 1, "unitId": "can" },
      { "name": "Pasta", "quantity": 12, "unitId": "oz" }
    ],
    "steps": ["Boil", "Toss"],
    "dietaryAttributeIds": [],
    "prepTimeMinutes": 5,
    "cookTimeMinutes": 15
  }' | jq

# Generate week (engine fill)
curl -s -X POST http://localhost:3000/weekly-plans/generate \
  -H 'content-type: application/json' \
  -d '{ "weekStartDate": "2026-07-13", "mode": "fill-empty" }' | jq

# Expect: filled days use only preference-safe recipes (not Anchovy pasta)
PLAN_ID=$(curl -s "http://localhost:3000/weekly-plans?weekStartDate=2026-07-13" \
  | jq -r '.items[0].id // .id // empty')

# If list shape differs, take id from generate response:
# PLAN_ID=$(…generate… | jq -r '.plan.id')

# Reject monday → engine alternative (or NO_SAFE_ALTERNATIVE)
curl -s -X PUT "http://localhost:3000/weekly-plans/$PLAN_ID/slots/monday/status" \
  -H 'content-type: application/json' \
  -d '{ "status": "rejected" }' | jq
```

## Automated checks

```bash
npm test -- tests/unit/meal-suggestion.test.ts
npm test -- tests/contract/meal-suggestion-engine.contract.test.ts
npm test -- tests/integration/meal-suggestion-engine.integration.test.ts
```

## Ownership checklist

- [ ] `src/domain/meal-suggestion.ts` documents MealSuggestionEngine ownership
      (`011`)
- [ ] `src/services/meal-suggestion-service.ts` is the service facade
- [ ] No new suggest-only HTTP route
- [ ] Behavior matches locked `008` ranking/filter/rotation rules
- [ ] Dedicated unit/contract/integration tests pass
