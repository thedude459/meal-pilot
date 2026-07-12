# Quickstart: Preference Profiles

**Feature**: `002-preference-profile` | **Date**: 2026-07-12

## Prerequisites

- Node.js 22+
- npm 10+
- Family Member Profiles foundation available (`001-family-member` schema +
  member create)

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
# Catalog
curl -s http://localhost:3000/dietary-restrictions | jq

# Ensure a member exists
MEMBER_ID=$(curl -s -X POST http://localhost:3000/family-members \
  -H 'content-type: application/json' \
  -d '{"displayName":"Alex"}' | jq -r .id)

# Replace preferences (order preserved; duplicates collapsed)
curl -s -X PUT "http://localhost:3000/family-members/$MEMBER_ID/preferences" \
  -H 'content-type: application/json' \
  -d '{
    "likes": ["pasta", "Pasta", "tacos"],
    "dislikes": ["olives", "pasta"],
    "dietaryRestrictionIds": ["gluten_free", "gluten_free", "nut_free"]
  }' | jq

# Stored profile
curl -s "http://localhost:3000/family-members/$MEMBER_ID/preferences" | jq

# Effective preferences (dislike-wins; hard restrictions unchanged)
curl -s "http://localhost:3000/family-members/$MEMBER_ID/preferences/effective" | jq

# Reject over-limit label
curl -s -X PUT "http://localhost:3000/family-members/$MEMBER_ID/preferences" \
  -H 'content-type: application/json' \
  -d "{
    \"likes\": [\"$(python3 -c 'print(\"x\"*41)')\"],
    \"dislikes\": [],
    \"dietaryRestrictionIds\": []
  }" | jq

# Reject unknown restriction
curl -s -X PUT "http://localhost:3000/family-members/$MEMBER_ID/preferences" \
  -H 'content-type: application/json' \
  -d '{
    "likes": [],
    "dislikes": [],
    "dietaryRestrictionIds": ["not_a_real_restriction"]
  }' | jq
```

## Expected results

| Step | Expect |
|------|--------|
| PUT valid preferences | `200`; likes `["pasta","tacos"]`; dislikes `["olives","pasta"]`; restrictions `["gluten_free","nut_free"]` |
| GET preferences | Same stored lists; order stable |
| GET effective | `effectiveLikes` excludes `pasta`; `hardRestrictions` includes `gluten_free`, `nut_free` |
| PUT 41-char label | `400` `PREFERENCE_LIMIT`; prior profile unchanged |
| PUT unknown restriction | `400` `UNKNOWN_RESTRICTION`; prior profile unchanged |
| Restart server | Stored preferences still present |

## Tests

```bash
npm test
```

Prefer suites under `tests/unit/preference-profile.test.ts`,
`tests/integration/preference-profile.integration.test.ts`, and
`tests/contract/preference-profiles.contract.test.ts` once authored.

## Speckit alignment

Normalization, limits, restriction catalog checks, and effective preference
helpers live in `src/domain/preference-profile.ts` (and related domain modules)
plus service replace/read use cases. HTTP routes must not re-implement those
rules. Roster create/rename/delete remain owned by Family Member Profiles.
