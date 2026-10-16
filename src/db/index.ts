import "server-only";
import fs from "node:fs";
import path from "node:path";
import { branchFiles, initialiseControl, type Branch } from "@/lib/tenancy/registry";
import { MIGRATIONS_FOLDER, applyMigrations, openDatabase, type Db } from "./client";
import { openControlDatabase, type ControlDb } from "./control-client";

/**
 * Database connections for this server process: the head office database
 * (data/control.db) and one database per branch, each opened on first use and
 * kept open (also across hot reloads in development).
 */
type Open = { db: Db; stamp: number };
const globalForDb = globalThis as unknown as { enyoControl?: ControlDb; enyoBranches?: Map<string, Open> };
const openBranches = (globalForDb.enyoBranches ??= new Map());

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

/**
 * Folder that holds everything: control.db, the branches/ folder and backups.
 * ENYO_DATA_DIR, else the folder of DATABASE_PATH (older single-restaurant
 * installs), else ./data.
 */
export function getDataDir(): string {
  if (process.env.ENYO_DATA_DIR) return path.resolve(process.env.ENYO_DATA_DIR);
  if (process.env.DATABASE_PATH) return path.dirname(path.resolve(process.env.DATABASE_PATH));
  return path.join(process.cwd(), "data");
}

/** Where an older single-restaurant install kept its database; adopted as the first branch. */
function legacyDbFile(): string {
  return process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(getDataDir(), "enyo.db");
}

export function getControlDb(): ControlDb {
  if (!globalForDb.enyoControl) {
    const control = openControlDatabase(path.join(getDataDir(), "control.db"));
    initialiseControl(control, getDataDir(), { legacyDbFile: legacyDbFile(), seedDemo: shouldSeedDemo() });
    globalForDb.enyoControl = control;
  }
  return globalForDb.enyoControl;
}

/** A branch's own database. */
export function getBranchDb(branch: Branch): Db {
  const current = openBranches.get(branch.id);
  if (!current) {
    const db = openDatabase(branchFiles(getDataDir(), branch).dbFile);
    openBranches.set(branch.id, { db, stamp: migrationsStamp() });
    return db;
  }
  // The dev server keeps connections between edits, so new migrations (from
  // `drizzle-kit generate`) would otherwise wait for a restart.
  if (process.env.NODE_ENV !== "production") {
    const stamp = migrationsStamp();
    if (stamp !== current.stamp) {
      applyMigrations(current.db);
      current.stamp = stamp;
    }
  }
  return current.db;
}

/** Closes a branch's connection (before a restore swaps its file). The next use reopens it. */
export function closeBranchDb(branchId: string): void {
  openBranches.get(branchId)?.db.$client.close();
  openBranches.delete(branchId);
}

/** A branch's database file, uploads folder and backups folder. */
export function filesFor(branch: Branch) {
  return branchFiles(getDataDir(), branch);
}

/** Number of branch-database migrations this version of the app knows about. */
export function appMigrationCount(): number {
  try {
    return (JSON.parse(fs.readFileSync(JOURNAL, "utf8")) as { entries: unknown[] }).entries.length;
  } catch {
    return 0;
  }
}

export type { Db, ControlDb, Branch };
