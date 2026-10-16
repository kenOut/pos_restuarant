import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

/** Drizzle over better-sqlite3; `$client` is the raw connection (used for backups). */
export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Applies any migrations in drizzle/ that this database hasn't had yet. Safe to call repeatedly. */
export function applyMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

/**
 * Opens (or creates) a SQLite file with the settings every ENYO POS database uses.
 * Pass ":memory:" for a throwaway database in tests.
 */
export function openSqlite(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  // WAL lets tills read while another writes; synchronous=FULL means a change
  // is on disk before it's confirmed, so a power cut can't lose it.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = FULL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

/**
 * Opens (or creates) a branch database and brings its schema up to date.
 * Pass ":memory:" for a throwaway database in tests.
 */
export function openDatabase(file: string): Db {
  const db = drizzle(openSqlite(file), { schema });
  applyMigrations(db);
  return db;
}
