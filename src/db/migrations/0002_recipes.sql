-- Recipes: household-scoped curated library with shared hybrid schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id),
  title TEXT NOT NULL,
  ingredients_json TEXT NOT NULL,
  instruction_steps_json TEXT NOT NULL,
  servings INTEGER,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  cuisine_tags_json TEXT NOT NULL DEFAULT '[]',
  dietary_attribute_ids_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'curated',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS recipes_household_id_idx ON recipes (household_id);
