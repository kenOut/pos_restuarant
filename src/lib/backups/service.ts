import "server-only";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { appMigrationCount, closeBranchDb, filesFor, getBranchDb, getControlDb, getDataDir, type Branch } from "@/db";
import { branches } from "@/db/control-schema";
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

/** In-memory state per branch for this server process. */
type BackupState = { running: Promise<BackupInfo> | null; lastError: string | null; lastCopyError: string | null };
const globalForBackups = globalThis as unknown as { enyoBackupStates?: Map<string, BackupState> };
const states = (globalForBackups.enyoBackupStates ??= new Map());
const stateFor = (branchId: string): BackupState => {
  if (!states.has(branchId)) states.set(branchId, { running: null, lastError: null, lastCopyError: null });
  return states.get(branchId)!;
};

export const canManageBackups = (role: StaffRole) => role === "owner";
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function backupsDir(branch: Branch): string {
  return filesFor(branch).backupsDir;
}

function backupSettings(branch: Branch) {
  const row = getBranchDb(branch).select({ backupTime: restaurants.backupTime, backupCopyDir: restaurants.backupCopyDir }).from(restaurants).limit(1).get();
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
export async function runBackup(branch: Branch, kind: BackupKind, { prune = true } = {}): Promise<BackupInfo> {
  const state = stateFor(branch.id);
  if (state.running) return state.running;
  state.running = (async () => {
    try {
      const { backupsDir: dir, uploadsDir } = filesFor(branch);
      const info = await createBackup({ source: getBranchDb(branch).$client, backupsDir: dir, uploadsDir, kind });
      if (info.integrity !== "ok") throw new Error(`The new backup failed its check: ${info.integrity}`);
      if (prune) pruneBackups(dir);
      state.lastError = null;

      const { copyDir } = backupSettings(branch);
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

export function getBackupStatus(branch: Branch): BackupStatus {
  const settings = backupSettings(branch);
  const state = stateFor(branch.id);
  return {
    backups: listBackups(backupsDir(branch)),
    folder: backupsDir(branch),
    time: settings.time,
    copyDir: settings.copyDir,
    nextRunAt: nextNightly(settings.time).getTime(),
    lastError: state.lastError,
    lastCopyError: state.lastCopyError,
    running: state.running !== null,
  };
}

type Result = { ok: true } | { ok: false; error: string };

export function updateBackupSettings(branch: Branch, actor: { role: StaffRole }, input: { time: string; copyDir: string }): Result {
  if (!canManageBackups(actor.role)) return { ok: false, error: "Only an owner can change backups." };
  const time = typeof input?.time === "string" ? input.time.trim() : "";
  if (!TIME_PATTERN.test(time)) return { ok: false, error: "Enter the time as HH:MM, e.g. 23:30." };

  const raw = typeof input?.copyDir === "string" ? input.copyDir.trim() : "";
  let copyDir: string | null = null;
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

  getBranchDb(branch).update(restaurants).set({ backupTime: time, backupCopyDir: copyDir }).where(eq(restaurants.id, branch.id)).run();
  return { ok: true };
}

/**
 * Replaces one branch's data with a backup's. A backup of the current data is
 * taken first, so the restore itself can be undone. Everyone at that branch is
 * signed out afterwards; other branches aren't touched.
 */
export async function restoreBackup(branch: Branch, actor: { role: StaffRole }, id: string): Promise<Result> {
  if (!canManageBackups(actor.role)) return { ok: false, error: "Only an owner can restore a backup." };
  const files = filesFor(branch);
  let problem: string | null;
  try {
    problem = checkRestorable(files.backupsDir, id, appMigrationCount());
  } catch {
    problem = "That backup can't be read.";
  }
  if (problem) return { ok: false, error: problem };

  // Not pruned: the backup being restored must survive this extra one.
  await runBackup(branch, "before-restore", { prune: false });

  // Synchronous from here on, so no other request can touch the database in between.
  closeBranchDb(branch.id);
  restoreFiles({ backupsDir: files.backupsDir, id, dbFile: files.dbFile, uploadsDir: files.uploadsDir });
  const db = getBranchDb(branch); // reopens, applying any newer migrations
  db.delete(sessions).run(); // everyone signs in again
  // Head office lists the branch under the name in the restored data.
  const restored = db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, branch.id)).get();
  if (restored) getControlDb().update(branches).set({ name: restored.name }).where(eq(branches.id, branch.id)).run();
  return { ok: true };
}
