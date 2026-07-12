-- Weekly plans + meal slots (sparse filled days)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS weekly_plans (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id),
  week_start_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS weekly_plans_household_week_key
  ON weekly_plans (household_id, week_start_date);

CREATE INDEX IF NOT EXISTS weekly_plans_household_id_idx ON weekly_plans (household_id);

CREATE TABLE IF NOT EXISTS meal_slots (
  id TEXT PRIMARY KEY NOT NULL,
  weekly_plan_id TEXT NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS meal_slots_plan_day_key
  ON meal_slots (weekly_plan_id, day);

CREATE INDEX IF NOT EXISTS meal_slots_recipe_id_idx ON meal_slots (recipe_id);

CREATE INDEX IF NOT EXISTS meal_slots_weekly_plan_id_idx ON meal_slots (weekly_plan_id);
