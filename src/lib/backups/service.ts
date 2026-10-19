import "server-only";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { appMigrationCount, branchDbFor, closeBranchDb, controlDbFor, filesFor, getDataDir, isOnline, type Branch, type Tenant } from "@/db";
import { branches } from "@/db/control-schema";
import { newEpoch, setMeta } from "@/lib/sync/engine";
import { restaurants, sessions, type StaffRole } from "@/db/schema";
import {
  checkRestorable,
  copyBackupTo,
  createBackup,
  listBackups,
  pruneBackups,
  restoreFiles,
  type BackupInfo,
  type BackupKind,
} from "./core";

/** In-memory state per branch for this server process (keyed by business and branch). */
type BackupState = { running: Promise<BackupInfo> | null; lastError: string | null; lastCopyError: string | null };
const globalForBackups = globalThis as unknown as { enyoBackupStates?: Map<string, BackupState> };
const states = (globalForBackups.enyoBackupStates ??= new Map());
const stateFor = (branchId: string): BackupState => {
  if (!states.has(branchId)) states.set(branchId, { running: null, lastError: null, lastCopyError: null });
  return states.get(branchId)!;
};

export const canManageBackups = (role: StaffRole) => role === "owner";
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function backupsDir(tenant: Tenant, branch: Branch): string {
  return filesFor(tenant, branch).backupsDir;
}

function backupSettings(tenant: Tenant, branch: Branch) {
  const row = branchDbFor(tenant, branch).select({ backupTime: restaurants.backupTime, backupCopyDir: restaurants.backupCopyDir }).from(restaurants).limit(1).get();
  return { time: row?.backupTime ?? "23:30", copyDir: row?.backupCopyDir ?? null };
}

/** The next scheduled nightly backup (today's if it's still to come, otherwise tomorrow's). */
export function nextNightly(time: string, now = new Date()): Date {
  const [h, m] = time.split(":").map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  return at;
}

/**
 * Takes a backup of one branch now, copies it to that branch's second folder
 * if one is set, then applies the keep rules. Only one backup per branch runs
 * at a time; a second request waits for the one in progress.
 */
export async function runBackup(tenant: Tenant, branch: Branch, kind: BackupKind, { prune = true } = {}): Promise<BackupInfo> {
  const state = stateFor(`${tenant.id}/${branch.id}`);
  if (state.running) return state.running;
  state.running = (async () => {
    try {
      const { backupsDir: dir, uploadsDir } = filesFor(tenant, branch);
      const info = await createBackup({ source: branchDbFor(tenant, branch).$client, backupsDir: dir, uploadsDir, kind });
      if (info.integrity !== "ok") throw new Error(`The new backup failed its check: ${info.integrity}`);
      if (prune) pruneBackups(dir);
      state.lastError = null;

      const { copyDir } = backupSettings(tenant, branch);
      if (copyDir) {
        try {
          // Each branch gets its own folder inside the second copy folder.
          copyBackupTo(dir, info.id, path.join(/*turbopackIgnore: true*/ copyDir, branch.slug));
          state.lastCopyError = null;
        } catch (error) {
          state.lastCopyError = `Couldn't copy to ${copyDir}: ${(error as Error).message}`;
        }
      }
      return info;
    } catch (error) {
      state.lastError = (error as Error).message;
      throw error;
    } finally {
      state.running = null;
    }
  })();
  return state.running;
}

export type BackupStatus = {
  backups: BackupInfo[];
  folder: string;
  time: string;
  copyDir: string | null;
  nextRunAt: number;
  lastError: string | null;
  lastCopyError: string | null;
  running: boolean;
};

export function getBackupStatus(tenant: Tenant, branch: Branch): BackupStatus {
  const settings = backupSettings(tenant, branch);
  const state = stateFor(`${tenant.id}/${branch.id}`);
  return {
    backups: listBackups(backupsDir(tenant, branch)),
    // On ENYO Online the server's own folders aren't the client's business.
    folder: isOnline() ? "ENYO Online" : backupsDir(tenant, branch),
    time: settings.time,
    copyDir: settings.copyDir,
    nextRunAt: nextNightly(settings.time).getTime(),
    lastError: state.lastError,
    lastCopyError: state.lastCopyError,
    running: state.running !== null,
  };
}

type Result = { ok: true } | { ok: false; error: string };

export function updateBackupSettings(tenant: Tenant, branch: Branch, actor: { role: StaffRole }, input: { time: string; copyDir: string }): Result {
  if (!canManageBackups(actor.role)) return { ok: false, error: "Only an owner can change backups." };
  const time = typeof input?.time === "string" ? input.time.trim() : "";
  if (!TIME_PATTERN.test(time)) return { ok: false, error: "Enter the time as HH:MM, e.g. 23:30." };

  const raw = typeof input?.copyDir === "string" ? input.copyDir.trim() : "";
  let copyDir: string | null = null;
  // A client on ENYO Online must never choose folders on the shared server.
  if (raw && isOnline()) return { ok: false, error: "On ENYO Online, backups are kept for you. A second copy folder is only for the restaurant's own computer." };
  if (raw) {
    if (!path.isAbsolute(raw)) return { ok: false, error: "Enter the full path of the folder, for example E:\\ENYO backups." };
    const resolved = path.resolve(raw);
    const dataDir = path.resolve(getDataDir());
    if (resolved === dataDir || resolved.startsWith(dataDir + path.sep)) {
      return { ok: false, error: "Choose a folder outside the app's data folder, for example on a USB drive." };
    }
    try {
      fs.mkdirSync(resolved, { recursive: true });
      const probe = path.join(resolved, ".enyo-write-test");
      fs.writeFileSync(probe, "ok");
      fs.rmSync(probe);
    } catch {
      return { ok: false, error: "That folder can't be written to. Is the drive plugged in?" };
    }
    copyDir = resolved;
  }

  branchDbFor(tenant, branch).update(restaurants).set({ backupTime: time, backupCopyDir: copyDir }).where(eq(restaurants.id, branch.id)).run();
  return { ok: true };
}

/**
 * Replaces one branch's data with a backup's. A backup of the current data is
 * taken first, so the restore itself can be undone. Everyone at that branch is
 * signed out afterwards; other branches aren't touched.
 */
export async function restoreBackup(tenant: Tenant, branch: Branch, actor: { role: StaffRole }, id: string): Promise<Result> {
  if (!canManageBackups(actor.role)) return { ok: false, error: "Only an owner can restore a backup." };
  const files = filesFor(tenant, branch);
  let problem: string | null;
  try {
    problem = checkRestorable(files.backupsDir, id, appMigrationCount());
  } catch {
    problem = "That backup can't be read.";
  }
  if (problem) return { ok: false, error: problem };

  // Not pruned: the backup being restored must survive this extra one.
  await runBackup(tenant, branch, "before-restore", { prune: false });

  // Synchronous from here on, so no other request can touch the database in between.
  closeBranchDb(tenant, branch.id);
  restoreFiles({ backupsDir: files.backupsDir, id, dbFile: files.dbFile, uploadsDir: files.uploadsDir });
  const db = branchDbFor(tenant, branch); // reopens, applying any newer migrations
  db.delete(sessions).run(); // everyone signs in again
  // The data went back in time: sync with ENYO Online sends and takes everything again,
  // and a new epoch tells the other side to do the same.
  setMeta(db.$client, "synced_with", "");
  newEpoch(db.$client);
  // Head office lists the branch under the name in the restored data.
  const restored = db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, branch.id)).get();
  if (restored) controlDbFor(tenant).update(branches).set({ name: restored.name }).where(eq(branches.id, branch.id)).run();
  return { ok: true };
}
