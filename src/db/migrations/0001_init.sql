-- Initial schema: household, family members, preference profiles
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id),
  display_name TEXT NOT NULL,
  display_name_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS family_members_household_name_key
  ON family_members (household_id, display_name_key);

CREATE TABLE IF NOT EXISTS preference_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  family_member_id TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  likes_json TEXT NOT NULL DEFAULT '[]',
  dislikes_json TEXT NOT NULL DEFAULT '[]',
  dietary_restriction_ids_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS preference_profiles_member_key
  ON preference_profiles (family_member_id);

-- Singleton household seed
INSERT OR IGNORE INTO households (id, created_at)
VALUES ('00000000-0000-4000-8000-000000000001', datetime('now'));
