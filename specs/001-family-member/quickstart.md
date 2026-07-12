# Quickstart: Family Member Profiles

**Feature**: `001-family-member` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+

## Setup (after implementation)

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
# Catalog
curl -s http://localhost:3000/dietary-restrictions | jq

# Add member
curl -s -X POST http://localhost:3000/family-members \
  -H 'content-type: application/json' \
  -d '{"displayName":"Alex"}' | jq

# List roster
curl -s http://localhost:3000/family-members | jq

# Set preferences (replace MEMBER_ID)
curl -s -X PUT http://localhost:3000/family-members/MEMBER_ID/preferences \
  -H 'content-type: application/json' \
  -d '{
    "likes": ["pasta", "tacos"],
    "dislikes": ["olives"],
    "dietaryRestrictionIds": ["gluten_free"]
  }' | jq

# Rename
curl -s -X PATCH http://localhost:3000/family-members/MEMBER_ID \
  -H 'content-type: application/json' \
  -d '{"displayName":"Alex Rivera"}' | jq

# Permanent delete
curl -s -o /dev/null -w "%{http_code}\n" \
  -X DELETE http://localhost:3000/family-members/MEMBER_ID
```

## Expected results

| Step | Expect |
|------|--------|
| POST create | `201` with empty `likes`/`dislikes`/`dietaryRestrictionIds` |
| POST duplicate name | `409` `DUPLICATE_NAME` |
| POST 13th member | `409` `MEMBER_LIMIT` |
| PUT unknown restriction | `400` `UNKNOWN_RESTRICTION` |
| DELETE | `204`; subsequent GET → `404` |
| Restart server | Roster and preferences still present |

## Tests

```bash
npm test
```

Runs unit, integration, and contract suites under `tests/`.

## Speckit alignment

Business rules (name uniqueness, 12-member cap, catalog restrictions, permanent
delete, preference conflict helpers) live in `src/domain` and
`src/services/family-member-service.ts` only. HTTP routes must not re-implement
those rules.
