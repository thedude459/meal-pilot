# Meal Pilot

Family meal planning & grocery automation — Speckit-driven.

## Features

### Family Member Profiles (`001`)

Household roster (create, list, rename, delete) with auto-created empty preference profiles.

### Preference Profiles (`002`)

View/replace likes, dislikes, and catalog dietary restrictions; effective preference helpers for meal-planning consumers (dislike-wins; hard restrictions at meal match).

### Quick start

```bash
npm install
npm run db:migrate
npm run dev
```

API: `http://localhost:3000`

- Family member smoke: [specs/001-family-member/quickstart.md](specs/001-family-member/quickstart.md)
- Preference profile smoke: [specs/002-preference-profile/quickstart.md](specs/002-preference-profile/quickstart.md)

```bash
npm test
```

### Speckit docs

- Constitution: `.specify/memory/constitution.md`
- Current plan: `specs/002-preference-profile/plan.md`
- Preference tasks: `specs/002-preference-profile/tasks.md`
