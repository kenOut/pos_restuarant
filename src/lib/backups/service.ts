import "server-only";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { appMigrationCount, closeDb, getDatabaseFile, getDb, getUploadsDir } from "@/db";
import { restaurants, sessions, type StaffRole } from "@/db/schema";
import {
  backupsDirFor,
  checkRestorable,
  copyBackupTo,
  createBackup,
  listBackups,
  pruneBackups,
  restoreFiles,
  type BackupInfo,
  type BackupKind,
} from "./core";

/** In-memory state of this server process (the main computer). */
type BackupState = { running: Promise<BackupInfo> | null; lastError: string | null; lastCopyError: string | null };
const globalForBackups = globalThis as unknown as { enyoBackupState?: BackupState };
const state = (globalForBackups.enyoBackupState ??= { running: null, lastError: null, lastCopyError: null });

export const canManageBackups = (role: StaffRole) => role === "owner";
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function backupsDir(): string {
  return backupsDirFor(getDatabaseFile());
}

function backupSettings() {
  const row = getDb().select({ backupTime: restaurants.backupTime, backupCopyDir: restaurants.backupCopyDir }).from(restaurants).limit(1).get();
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
 * Takes a backup now, copies it to the second folder if one is set, then
 * applies the keep rules. Only one backup runs at a time; a second request
 * waits for the one in progress.
 */
export async function runBackup(kind: BackupKind, { prune = true } = {}): Promise<BackupInfo> {
  if (state.running) return state.running;
  state.running = (async () => {
    try {
      const dir = backupsDir();
      const info = await createBackup({ source: getDb().$client, backupsDir: dir, uploadsDir: getUploadsDir(), kind });
      if (info.integrity !== "ok") throw new Error(`The new backup failed its check: ${info.integrity}`);
      if (prune) pruneBackups(dir);
      state.lastError = null;

      const { copyDir } = backupSettings();
      if (copyDir) {
        try {
          copyBackupTo(dir, info.id, copyDir);
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

export function getBackupStatus(): BackupStatus {
  const settings = backupSettings();
  return {
    backups: listBackups(backupsDir()),
    folder: backupsDir(),
    time: settings.time,
    copyDir: settings.copyDir,
    nextRunAt: nextNightly(settings.time).getTime(),
    lastError: state.lastError,
    lastCopyError: state.lastCopyError,
    running: state.running !== null,
  };
}

type Result = { ok: true } | { ok: false; error: string };

export function updateBackupSettings(actor: { restaurantId: string; role: StaffRole }, input: { time: string; copyDir: string }): Result {
  if (!canManageBackups(actor.role)) return { ok: false, error: "Only an owner can change backups." };
  const time = typeof input?.time === "string" ? input.time.trim() : "";
  if (!TIME_PATTERN.test(time)) return { ok: false, error: "Enter the time as HH:MM, e.g. 23:30." };

  const raw = typeof input?.copyDir === "string" ? input.copyDir.trim() : "";
  let copyDir: string | null = null;
  if (raw) {
    if (!path.isAbsolute(raw)) return { ok: false, error: "Enter the full path of the folder, for example E:\\ENYO backups." };
    const resolved = path.resolve(raw);
    const dataDir = path.resolve(path.dirname(getDatabaseFile()));
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

  getDb().update(restaurants).set({ backupTime: time, backupCopyDir: copyDir }).where(eq(restaurants.id, actor.restaurantId)).run();
  return { ok: true };
}

/**
 * Replaces all data with a backup's. A backup of the current data is taken
 * first, so the restore itself can be undone. Everyone is signed out
 * afterwards: sessions in the old data don't carry over.
 */
export async function restoreBackup(actor: { role: StaffRole }, id: string): Promise<Result> {
  if (!canManageBackups(actor.role)) return { ok: false, error: "Only an owner can restore a backup." };
  const dir = backupsDir();
  let problem: string | null;
  try {
    problem = checkRestorable(dir, id, appMigrationCount());
  } catch {
    problem = "That backup can't be read.";
  }
  if (problem) return { ok: false, error: problem };

  // Not pruned: the backup being restored must survive this extra one.
  await runBackup("before-restore", { prune: false });

  // Synchronous from here on, so no other request can touch the database in between.
  closeDb();
  restoreFiles({ backupsDir: dir, id, dbFile: getDatabaseFile(), uploadsDir: getUploadsDir() });
  getDb().delete(sessions).run(); // reopens (applying any newer migrations), then signs everyone out
  return { ok: true };
}
