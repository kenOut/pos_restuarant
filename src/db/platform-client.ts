import path from "node:path";
import type Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openSqlite } from "./client";
import * as platformSchema from "./platform-schema";

export type PlatformDb = BetterSQLite3Database<typeof platformSchema> & { $client: Database.Database };

export const PLATFORM_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle-platform");

/** Opens (or creates) the platform database and brings its schema up to date. */
export function openPlatformDatabase(file: string): PlatformDb {
  const db = drizzle(openSqlite(file), { schema: platformSchema });
  migrate(db, { migrationsFolder: PLATFORM_MIGRATIONS_FOLDER });
  return db;
}
