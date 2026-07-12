import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000001";

export type AppDatabase = BetterSQLite3Database<typeof schema>;
type SqliteDatabase = InstanceType<typeof Database>;

export type DbHandle = {
  db: AppDatabase;
  sqlite: SqliteDatabase;
  path: string;
};

function resolveDbPath(dbPath?: string): string {
  return dbPath ?? process.env.MEAL_PILOT_DB_PATH ?? join(process.cwd(), "data", "meal-pilot.sqlite");
}

export function createDb(dbPath?: string): DbHandle {
  const path = resolveDbPath(dbPath);
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, path };
}

function resolveMigrationsDir(): string {
  const candidates = [
    join(__dirname, "migrations"),
    join(process.cwd(), "src", "db", "migrations"),
    join(process.cwd(), "dist", "db", "migrations"),
  ];
  for (const dir of candidates) {
    try {
      if (readdirSync(dir).some((f) => f.endsWith(".sql"))) {
        return dir;
      }
    } catch {
      // try next
    }
  }
  throw new Error("No SQL migrations found");
}

export function runMigrations(sqlite: SqliteDatabase): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = resolveMigrationsDir();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const already = sqlite.prepare("SELECT 1 FROM schema_migrations WHERE id = ?").get(file);
    if (already) continue;
    const sqlText = readFileSync(join(migrationsDir, file), "utf8");
    sqlite.exec(sqlText);
    sqlite.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(file);
  }
}

let singleton: DbHandle | null = null;

export function getDb(dbPath?: string): DbHandle {
  if (!singleton) {
    singleton = createDb(dbPath);
    runMigrations(singleton.sqlite);
  }
  return singleton;
}

export function resetDbSingleton(): void {
  if (singleton) {
    singleton.sqlite.close();
    singleton = null;
  }
}
