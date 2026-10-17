import "server-only";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import path from "node:path";
import { branchFiles, initialiseControl, type Branch } from "@/lib/tenancy/registry";
import { MIGRATIONS_FOLDER, applyMigrations, openDatabase, type Db } from "./client";
import { openControlDatabase, type ControlDb } from "./control-client";
import { openPlatformDatabase, type PlatformDb } from "./platform-client";
import { businesses, type Business } from "./platform-schema";

/**
 * Database connections for this server process.
 *
 * Local mode (the restaurant's main computer): one business, the "local"
 * tenant, with its head office database in data/control.db and its branches
 * in data/branches/.
 *
 * Online mode (ENYO Online, ENYO_MODE=online): many client businesses, each a
 * tenant with its own folder, data/businesses/<id>/, holding its own head
 * office database and branch databases. data/platform.db lists the businesses.
 *
 * Every connection is opened on first use and kept open (also across hot reloads).
 */
export type Tenant = {
  /** "local", or the business id. */
  id: string;
  /** Folder holding this tenant's control.db and branches/. */
  dataDir: string;
  /** An older single-restaurant database to adopt as the first branch (local mode only). */
  legacyDbFile: string | null;
  seedDemo: boolean;
};

type Open = { db: Db; stamp: number };
const globalForDb = globalThis as unknown as {
  enyoPlatform?: PlatformDb;
  enyoControls?: Map<string, ControlDb>;
  enyoBranches?: Map<string, Open>;
};
const controls = (globalForDb.enyoControls ??= new Map());
const openBranches = (globalForDb.enyoBranches ??= new Map());

const JOURNAL = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");

function migrationsStamp(): number {
  try {
    return fs.statSync(JOURNAL).mtimeMs;
  } catch {
    return 0;
  }
}

/** ENYO Online: many client businesses on one server. */
export const isOnline = () => process.env.ENYO_MODE === "online";

function shouldSeedDemo(): boolean {
  if (process.env.ENYO_SEED_DEMO === "0") return false;
  return process.env.NODE_ENV !== "production" || process.env.ENYO_SEED_DEMO === "1";
}

/**
 * Folder that holds everything. ENYO_DATA_DIR, else the folder of
 * DATABASE_PATH (older single-restaurant installs), else ./data.
 */
export function getDataDir(): string {
  if (process.env.ENYO_DATA_DIR) return path.resolve(process.env.ENYO_DATA_DIR);
  if (process.env.DATABASE_PATH) return path.dirname(path.resolve(process.env.DATABASE_PATH));
  return path.join(process.cwd(), "data");
}

/** The restaurant computer's one business. */
export function localTenant(): Tenant {
  return {
    id: "local",
    dataDir: getDataDir(),
    legacyDbFile: process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(getDataDir(), "enyo.db"),
    seedDemo: shouldSeedDemo(),
  };
}

/** A client business on ENYO Online. Starts empty: no demo data, nothing to adopt. */
export function tenantFor(business: Pick<Business, "id">): Tenant {
  return { id: business.id, dataDir: path.join(getDataDir(), "businesses", business.id), legacyDbFile: null, seedDemo: false };
}

/** The list of client businesses (online mode only). */
export function getPlatformDb(): PlatformDb {
  if (!isOnline()) throw new Error("The platform database is only used in online mode.");
  return (globalForDb.enyoPlatform ??= openPlatformDatabase(path.join(getDataDir(), "platform.db")));
}

/** A tenant's head office database. */
export function controlDbFor(tenant: Tenant): ControlDb {
  let control = controls.get(tenant.id);
  if (!control) {
    fs.mkdirSync(tenant.dataDir, { recursive: true });
    control = openControlDatabase(path.join(tenant.dataDir, "control.db"));
    initialiseControl(control, tenant.dataDir, { legacyDbFile: tenant.legacyDbFile, seedDemo: tenant.seedDemo });
    controls.set(tenant.id, control);
  }
  return control;
}

const branchKey = (tenant: Tenant, branchId: string) => `${tenant.id}/${branchId}`;

/** One branch's own database. */
export function branchDbFor(tenant: Tenant, branch: Branch): Db {
  const key = branchKey(tenant, branch.id);
  const current = openBranches.get(key);
  if (!current) {
    const db = openDatabase(branchFiles(tenant.dataDir, branch).dbFile);
    openBranches.set(key, { db, stamp: migrationsStamp() });
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
export function closeBranchDb(tenant: Tenant, branchId: string): void {
  const key = branchKey(tenant, branchId);
  openBranches.get(key)?.db.$client.close();
  openBranches.delete(key);
}

/** A branch's database file, uploads folder and backups folder. */
export function filesFor(tenant: Tenant, branch: Branch) {
  return branchFiles(tenant.dataDir, branch);
}

/** Every tenant on this server: the local one, or each client business that's active. */
export function allTenants(): Tenant[] {
  if (!isOnline()) return [localTenant()];
  return getPlatformDb().select().from(businesses).where(eq(businesses.active, true)).all().map(tenantFor);
}

/** Number of branch-database migrations this version of the app knows about. */
export function appMigrationCount(): number {
  try {
    return (JSON.parse(fs.readFileSync(JOURNAL, "utf8")) as { entries: unknown[] }).entries.length;
  } catch {
    return 0;
  }
}

export type { Db, ControlDb, PlatformDb, Branch, Business };
