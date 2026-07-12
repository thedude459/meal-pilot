-- Ingredients: household-scoped catalog with shopping category + aliases
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id),
  display_name TEXT NOT NULL,
  display_name_key TEXT NOT NULL,
  default_unit_id TEXT NOT NULL,
  shopping_category_id TEXT,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ingredients_household_name_key
  ON ingredients (household_id, display_name_key);

CREATE INDEX IF NOT EXISTS ingredients_household_id_idx ON ingredients (household_id);
