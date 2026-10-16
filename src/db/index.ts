import "server-only";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS_FOLDER, applyMigrations, openDatabase, type Db } from "./client";
import { seedDemoData } from "./seed";

// Keep one connection across hot reloads in development.
const globalForDb = globalThis as unknown as { enyoDb?: Db; enyoMigrationsStamp?: number };

const JOURNAL = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");

function migrationsStamp(): number {
  try {
    return fs.statSync(JOURNAL).mtimeMs;
  } catch {
    return 0;
  }
}

function shouldSeedDemo(): boolean {
  if (process.env.ENYO_SEED_DEMO === "0") return false;
  return process.env.NODE_ENV !== "production" || process.env.ENYO_SEED_DEMO === "1";
}

const databaseFile = () => process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "enyo.db");

/** Path of the live database file. */
export function getDatabaseFile(): string {
  return databaseFile();
}

/** Number of migrations this version of the app knows about. */
export function appMigrationCount(): number {
  try {
    return (JSON.parse(fs.readFileSync(JOURNAL, "utf8")) as { entries: unknown[] }).entries.length;
  } catch {
    return 0;
  }
}

/** Closes the connection (before a restore swaps the file). The next getDb() reopens it. */
export function closeDb(): void {
  globalForDb.enyoDb?.$client.close();
  globalForDb.enyoDb = undefined;
}

/** Uploaded files (the logo) live next to the database, so backups can include them. */
export function getUploadsDir(): string {
  return path.join(path.dirname(databaseFile()), "uploads");
}

/** The restaurant database on this main computer (data/enyo.db unless DATABASE_PATH is set). */
export function getDb(): Db {
  if (!globalForDb.enyoDb) {
    const file = databaseFile();
    const db = openDatabase(file);
    if (shouldSeedDemo()) seedDemoData(db);
    globalForDb.enyoDb = db;
    globalForDb.enyoMigrationsStamp = migrationsStamp();
  } else if (process.env.NODE_ENV !== "production") {
    // The dev server keeps its connection between edits, so new migrations
    // (from `drizzle-kit generate`) would otherwise wait for a restart.
    const stamp = migrationsStamp();
    if (stamp !== globalForDb.enyoMigrationsStamp) {
      applyMigrations(globalForDb.enyoDb);
      if (shouldSeedDemo()) seedDemoData(globalForDb.enyoDb);
      globalForDb.enyoMigrationsStamp = stamp;
    }
  }
  return globalForDb.enyoDb;
}

export type { Db };
