# Implementation Plan: Update Pantry

**Branch**: `010-update-pantry` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-update-pantry/spec.md`

## Summary

Deliver the constitution **UpdatePantry** workflow as `PantryManager` on the
existing TypeScript + Hono + SQLite stack. Organizers explicitly confirm
checked GroceryItems after shopping; the manager optionally removes expired
pantry rows first (UTC), evaluates the 500-item pantry cap after those
removals, then atomically creates or increases PantryItems from purchased
quantities, deletes applied grocery lines, and returns an `ApplyReport`. A
read-only preview accepts the same `removeExpired` flag and projects the same
cleanup-then-apply outcomes without mutating data. Meal-cook decrement,
export, and unit conversion remain out of scope.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS

**Primary Dependencies**: Hono (HTTP API), Zod (validation), Drizzle ORM +
better-sqlite3 (persistence), Vitest (tests)

**Storage**: SQLite — no new durable tables. Reuse `grocery_items` (read
checked / delete applied), `pantry_items` (delete expired / create / quantity
increase), `ingredients` (default unit + display name). `ApplyReport` and
preview payloads are response-only.

**Testing**: Vitest for unit (cleanup-then-apply ordering, create vs increase,
cap after cleanup, quantity rounding, expired UTC boundary, preview projection
parity), integration (confirm apply + grocery removal, atomic fail on unit/
cap/zero-checked, cleanup-only reject, unchecked preserved, double-confirm
reject), and contract (update-pantry OpenAPI). Quickstart smoke is the manual
acceptance path.

**Target Platform**: Local Node.js service (macOS/Linux/Windows); API consumed by
a future organizer UI

**Project Type**: Single-project modular domain service + HTTP API

**Performance Goals**: Organizer preview-then-confirm under 2 minutes for ≤20
checked lines (SC-002). Stretch: local confirm for ≤500 grocery/pantry rows
completes in a few seconds; no load harness required in `010` tasks. Quickstart
+ Vitest are the acceptance path.

**Constraints**: Deterministic path; explicit confirm (not auto on check);
≥1 checked required on confirm (including when `removeExpired` true);
cleanup-then-apply when `removeExpired`; cap 500 evaluated after cleanup
removals; grocery unit must equal Ingredient `defaultUnitId`; new pantry
expiration unset; increase preserves existing expiration; remove applied
GroceryItems; leave unchecked unchanged; atomic fail with no partial writes;
preview same flag + projection, no mutations; reuse `roundQuantity` and UTC
“today” helper from BuildGroceryList; error split — zero checked →
`UPDATE_PANTRY_NO_CHECKED` (400); validation/unit → `VALIDATION_ERROR` /
`UNIT_MISMATCH` (400); cap → `PANTRY_INVENTORY_FULL` (409); no business logic
outside Speckit domain modules

**Scale/Scope**: 1 household (v1 default), ≤500 pantry items, ≤500 grocery
items; meal-cook decrement, unit conversion, multi-lot stock, grocery rebuild,
export out of delivery scope

**Follow-on features** (constitution-adjacent — deferred):
- Pantry decrement when meals are cooked
- Unit conversion / multi-lot stock
- Grocery export (still deferred from `009`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Family Preference Priority**: N/A for delivery — does not re-filter meals.
- **Balanced Weekly Planning**: N/A — does not generate or alter meal plans.
- **Automatic Grocery Generation**: N/A for delivery — does not build lists;
  consumes checked GroceryItems produced by shopping / BuildGroceryList.
- **Pantry-Aware Inventory**: PASS — implements pantry updates after grocery
  completion with explicit user confirmation (constitution “automatically”
  means the system applies stock changes via UpdatePantry after confirm — not
  a silent side effect of checking a grocery line; see spec Assumptions).
  Applies purchased items, adjusts quantities, optionally removes expired.
- **Hybrid Recipe Sourcing**: PASS — does not create AI recipes; path is
  deterministic.
- **Speckit-Driven Modularity**: PASS — `PantryManager` + UpdatePantry workflow
  defined as Speckit specs; writes through PantryItem / GroceryItem services;
  HTTP transport-only.
- **Extensibility**: PASS — declares purpose (confirm purchases → pantry) and
  dependencies (GroceryItem, PantryItem, Ingredient); does not break
  BuildGroceryList or PantryItem CRUD contracts.

### Post-design re-check

All gates remain PASS/N/A. No Complexity Tracking entries required. Design
supplies `POST /pantry-items/update` + `POST /pantry-items/update/preview`,
pure cleanup/apply projection helpers, and one atomic SQLite transaction for
confirm.

## Project Structure

### Documentation (this feature)

```text
specs/010-update-pantry/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── update-pantry.openapi.yaml
└── tasks.md              # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── pantry-manager.ts          # Pure project/apply helpers (cleanup order,
│   │                              # create vs increase, cap after cleanup)
│   ├── pantry-item.ts             # Reuse quantity/unit/expiration rules
│   ├── grocery-item.ts            # Reuse checked / quantity rules
│   ├── quantity.ts                # Reuse roundQuantity
│   ├── grocery-list-builder.ts    # Reuse utcTodayDate (or extract shared date
│   │                              # helper if preferred during implement)
│   ├── errors.ts                  # Add UPDATE_PANTRY_NO_CHECKED; reuse
│   │                              # VALIDATION_ERROR, UNIT_MISMATCH,
│   │                              # PANTRY_INVENTORY_FULL
│   └── …
├── services/
│   ├── pantry-manager-service.ts  # UpdatePantry preview + confirm orchestration
│   ├── pantry-item-service.ts     # Reuse list/create/replace/delete; internal
│   │                              # helpers for atomic batch if needed
│   ├── grocery-item-service.ts    # Reuse list checked + delete
│   └── ingredient-service.ts      # Read defaultUnitId / displayName
├── db/
│   ├── schema.ts                  # No new tables required for v1
│   └── …
├── api/
│   ├── app.ts                     # Mount update routes on pantry-items
│   └── routes/
│       ├── pantry-items.ts        # Existing CRUD
│       └── update-pantry.ts       # POST update + preview
└── index.ts

tests/
├── contract/
│   └── update-pantry.contract.test.ts
├── integration/
│   └── update-pantry.integration.test.ts
└── unit/
    └── pantry-manager.test.ts
```

**Structure Decision**: Continue the single-project layout from `001`–`009`. Add
`PantryManager` as `pantry-manager-service.ts` + pure domain helpers in
`pantry-manager.ts`, rather than folding confirm logic into PantryItemService.
No new SQLite tables; confirm runs in one transaction.

## Complexity Tracking

> No constitution violations requiring justification.
