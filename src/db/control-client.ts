import path from "node:path";
import type Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openSqlite } from "./client";
import * as controlSchema from "./control-schema";

export type ControlDb = BetterSQLite3Database<typeof controlSchema> & { $client: Database.Database };

export const CONTROL_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle-control");

/** Opens (or creates) the head office database and brings its schema up to date. */
export function openControlDatabase(file: string): ControlDb {
  const db = drizzle(openSqlite(file), { schema: controlSchema });
  migrate(db, { migrationsFolder: CONTROL_MIGRATIONS_FOLDER });
  return db;
}
