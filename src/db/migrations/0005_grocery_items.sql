-- Grocery items: one shopping-list line per ingredient per household
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS grocery_items (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id),
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
  quantity REAL NOT NULL,
  unit_id TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS grocery_items_household_ingredient_key
  ON grocery_items (household_id, ingredient_id);

CREATE INDEX IF NOT EXISTS grocery_items_household_id_idx ON grocery_items (household_id);

CREATE INDEX IF NOT EXISTS grocery_items_ingredient_id_idx ON grocery_items (ingredient_id);
