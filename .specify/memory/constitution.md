<!--
Sync Impact Report
- Version change: (none) → 1.0.0
- Modified principles: N/A (initial ratification from template placeholders)
  - [PRINCIPLE_1_NAME] → I. Family Preference Priority
  - [PRINCIPLE_2_NAME] → II. Balanced Weekly Planning
  - [PRINCIPLE_3_NAME] → III. Automatic Grocery Generation
  - [PRINCIPLE_4_NAME] → IV. Pantry-Aware Inventory
  - [PRINCIPLE_5_NAME] → V. Hybrid Recipe Sourcing
  - (added) → VI. Speckit-Driven Modularity
- Added sections:
  - Purpose
  - Domain Overview
  - Behavioral Rules (Meal Planning, Grocery List Generation, Pantry Management,
    Recipe Hybrid Engine)
  - Core Workflows (GenerateWeeklyMeals, BuildGroceryList, UpdatePantry)
  - Architectural Rules
  - Extensibility Guidelines
  - Constraints
  - Definitions
  - Governance (full amendment/versioning/compliance policy)
- Removed sections: None (template placeholders replaced)
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ updated (Constitution Check gates)
  - .specify/templates/spec-template.md ✅ updated (domain entities + constraints)
  - .specify/templates/tasks-template.md ✅ updated (workflow/service task guidance)
  - .specify/templates/commands/*.md — N/A (directory not present)
  - README.md / docs/quickstart.md — N/A (not present at project root)
- Follow-up TODOs: None
-->

# Meal Pilot Constitution

## Purpose

This constitution defines the governing rules, architecture principles, workflows,
and behavioral expectations for Meal Pilot: an application that generates weekly
meal plans from family preferences and automatically produces grocery lists. The
system integrates curated recipes, AI-generated suggestions, pantry tracking, and
household profiles. All features MUST extend this constitution rather than
override it.

## Core Principles

### I. Family Preference Priority

The system MUST prioritize family member preferences, dietary restrictions, and
dislikes when generating or ranking meal suggestions.

**Rationale**: Households adopt the product only when plans respect real
constraints and tastes; preference violations invalidate the weekly plan.

### II. Balanced Weekly Planning

Weekly meal plans MUST balance variety, nutrition, and preparation difficulty.
Plans MUST apply rotation rules that avoid repeating meals too frequently.
Plans MUST consider time constraints and MAY consider budget constraints as a
future extension.

**Rationale**: A plan that is only preference-aligned but repetitive, hard to
cook, or nutritionally skewed fails day-to-day use.

### III. Automatic Grocery Generation

Grocery lists MUST be automatically generated from approved meals. Generation
MUST combine ingredients across approved meals, remove duplicates, merge
quantities, and group items by shopping category (produce, dairy, meat, and
similar categories). The system MUST support exporting grocery lists to external
services.

**Rationale**: Manual list building defeats the core value of meal-to-shopping
automation.

### IV. Pantry-Aware Inventory

Pantry inventory MUST adjust grocery lists by subtracting items already
available. Grocery list generation MUST NEVER include pantry items unless the
available quantity is insufficient. Pantry items MUST track quantity and unit,
and MAY track expiration. After grocery list completion with user confirmation,
pantry updates MUST occur automatically.

**Rationale**: Shopping what the household already has wastes money and erodes
trust in the list.

### V. Hybrid Recipe Sourcing

The system MUST support hybrid recipe sourcing: curated recipes plus
AI-generated meals. Curated and AI-generated recipes MUST share the same
structured schema and metadata. AI-generated recipes MUST be validated against
dietary restrictions before inclusion in a plan. Non-AI paths MUST remain
deterministic; AI generation is the only explicitly non-deterministic path.

**Rationale**: Curated quality and AI coverage both matter; a shared schema keeps
planning, grocery, and pantry logic consistent.

### VI. Speckit-Driven Modularity

All components MUST be modular, testable, and Speckit-spec driven. Domain
entities, workflows, and services MUST be defined as Speckit specs. No business
logic MAY exist outside of specs or workflows.

**Rationale**: Spec-first modularity keeps behavior reviewable, testable, and
extensible without hidden side logic.

## Domain Overview

The application manages:

- Family member profiles
- Preference profiles
- Recipes and ingredients
- Weekly meal plans
- Grocery lists
- Pantry inventory
- Meal suggestion logic
- Hybrid recipe generation
- Workflow automation

## Behavioral Rules

### Meal Planning

- The system MUST generate a weekly plan of meals based on family preferences,
  dietary restrictions, time constraints, optional budget constraints, and
  rotation rules.
- Users MAY approve, reject, or modify suggested meals.
- Rejected meals MUST trigger alternative suggestions.

### Grocery List Generation

- Grocery lists MUST combine ingredients across all approved meals, remove
  duplicates, adjust quantities based on pantry inventory, and group items by
  category.
- The system MUST support exporting grocery lists to external services.

### Pantry Management

- Pantry items MUST track quantity and unit; expiration MAY be tracked.
- Pantry updates MUST occur automatically after grocery list completion with
  user confirmation.

### Recipe Hybrid Engine

- Curated recipes MUST be stored with structured metadata.
- AI-generated recipes MUST follow the same schema.
- The engine MUST suggest recipes based on preferences, allow ingredient
  substitution, and support seasonal or budget-based filtering.

## Core Workflows

### Workflow: GenerateWeeklyMeals

- **Input**: Family profiles, preferences, pantry data
- **Output**: Weekly meal plan
- **Steps**: Evaluate preferences → Generate candidate meals → Filter based on
  constraints → Produce final weekly plan

### Workflow: BuildGroceryList

- **Input**: Approved weekly meals
- **Output**: Grocery list
- **Steps**: Extract ingredients → Merge quantities → Subtract pantry inventory
  → Categorize items → Produce final list

### Workflow: UpdatePantry

- **Input**: Grocery list + user confirmation
- **Output**: Updated pantry inventory
- **Steps**: Add purchased items → Adjust quantities → Optionally remove expired
  items

## Architectural Rules

- All domain entities MUST be defined as Speckit specs.
- All workflows MUST be defined as Speckit specs.
- All services (`MealSuggestionEngine`, `GroceryListBuilder`, `PantryManager`,
  `RecipeHybridEngine`) MUST be defined as Speckit specs.
- No business logic MAY exist outside of specs or workflows.
- All future features MUST extend the constitution rather than override it.

## Extensibility Guidelines

Future modules MUST maintain compatibility with existing workflows
(`GenerateWeeklyMeals`, `BuildGroceryList`, `UpdatePantry`). Supported future
modules include:

- Nutrition tracking
- Budget optimization
- Store-specific grocery lists
- Meal prep scheduling
- Seasonal meal rotation

New modules MUST declare their purpose and dependencies.

## Constraints

- The system MUST remain deterministic unless explicitly using AI generation.
- AI-generated recipes MUST be validated against dietary restrictions.
- Grocery list generation MUST NEVER include items already in the pantry unless
  quantity is insufficient.

## Definitions

- **FamilyMember**: A person in the household with preferences.
- **PreferenceProfile**: Structured likes, dislikes, and restrictions.
- **Recipe**: A meal definition with ingredients and instructions.
- **Ingredient**: A measurable food item.
- **GroceryItem**: An ingredient mapped to a shopping category.
- **PantryItem**: An ingredient stored with quantity (and optional expiration).
- **WeeklyPlan**: A structured list of meals for the week.

## Governance

This constitution supersedes conflicting local practices. Amendments MUST be
intentional, documented, and versioned.

- **Amendment procedure**: Propose changes with rationale and impacted
  principles/workflows; update `.specify/memory/constitution.md`; propagate
  required template and guidance updates; record version and date.
- **Versioning policy**: Semantic versioning — MAJOR for backward-incompatible
  principle removals or redefinitions; MINOR for new principles/sections or
  materially expanded guidance; PATCH for clarifications and non-semantic
  refinements.
- **Compliance review**: Specs, plans, and PRs MUST verify alignment with Core
  Principles, Architectural Rules, and Constraints. Complexity beyond modular
  Speckit boundaries MUST be justified. New modules MUST declare purpose and
  dependencies and MUST NOT break existing workflow contracts.

**Version**: 1.0.0 | **Ratified**: 2026-07-12 | **Last Amended**: 2026-07-12
