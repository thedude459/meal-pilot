# Meal Pilot

Family meal planning & grocery automation — Speckit-driven.

## Features

### Family Member Profiles (`001`)

Household roster (create, list, rename, delete) with auto-created empty preference profiles.

### Preference Profiles (`002`)

View/replace likes, dislikes, and catalog dietary restrictions; effective preference helpers for meal-planning consumers (dislike-wins; hard restrictions at meal match).

### Recipes (`003`)

Household curated recipe library with shared hybrid schema (`source: curated | ai`), measurable ingredients, ordered steps, unit catalog, and dietary attribute tags (PreferenceProfile catalog IDs). AI generation is out of scope for this feature.

### Ingredients (`004`)

Household ingredient catalog with normalized display names, default units (shared with Recipes), optional shopping categories, and aliases for future matching. Recipe free-text lines remain unchanged.

### Pantry Items (`005`)

Household pantry inventory: one stock row per catalog Ingredient with quantity (≤3 decimal places), unit matching the Ingredient default, and optional expiration. Ingredient delete is blocked while stocked. See [specs/005-pantry-item/quickstart.md](specs/005-pantry-item/quickstart.md).

### Grocery Items (`006`)

Household shopping list: one GroceryItem line per catalog Ingredient with quantity (≤3 decimal places), unit matching the Ingredient default, checked (purchased) status via dedicated toggle, and list grouped by shopping-category catalog order. Ingredient delete is blocked while listed. See [specs/006-grocery-item/quickstart.md](specs/006-grocery-item/quickstart.md).

### Weekly Plans (`007`)

Household weekly meal plans for a Monday week-start with up to seven day slots (one meal per day), Recipe assignment, and pending/approved/rejected status via per-slot actions. Recipe delete is blocked while slotted. See [specs/007-weekly-plan/quickstart.md](specs/007-weekly-plan/quickstart.md).

### Quick start

```bash
npm install
npm run db:migrate
npm run dev
```

API: `http://localhost:3000`

- Family member smoke: [specs/001-family-member/quickstart.md](specs/001-family-member/quickstart.md)
- Preference profile smoke: [specs/002-preference-profile/quickstart.md](specs/002-preference-profile/quickstart.md)
- Recipe smoke: [specs/003-recipe/quickstart.md](specs/003-recipe/quickstart.md)
- Ingredient smoke: [specs/004-ingredient/quickstart.md](specs/004-ingredient/quickstart.md)
- Pantry item smoke: [specs/005-pantry-item/quickstart.md](specs/005-pantry-item/quickstart.md)
- Grocery item smoke: [specs/006-grocery-item/quickstart.md](specs/006-grocery-item/quickstart.md)
- Weekly plan smoke: [specs/007-weekly-plan/quickstart.md](specs/007-weekly-plan/quickstart.md)

```bash
npm test
```

### Speckit docs

- Constitution: `.specify/memory/constitution.md`
- Current plan: `specs/007-weekly-plan/plan.md`
- Weekly plan tasks: `specs/007-weekly-plan/tasks.md`
