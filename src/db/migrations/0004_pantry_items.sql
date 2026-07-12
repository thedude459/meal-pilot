-- Pantry items: one stock row per ingredient per household
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pantry_items (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id),
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
  quantity REAL NOT NULL,
  unit_id TEXT NOT NULL,
  expiration_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS pantry_items_household_ingredient_key
  ON pantry_items (household_id, ingredient_id);

CREATE INDEX IF NOT EXISTS pantry_items_household_id_idx ON pantry_items (household_id);

CREATE INDEX IF NOT EXISTS pantry_items_ingredient_id_idx ON pantry_items (ingredient_id);
