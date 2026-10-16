// Backups: create, check, list, prune and restore.
//
// Self-contained on purpose (Node built-ins and better-sqlite3 only, no "@/"
// imports, no TypeScript-only syntax) so the command-line scripts in
// scripts/ can run it directly with Node when the app itself won't start.
//
// Each backup is a folder:  <backups dir>/<id>/
//   enyo.db        consistent copy of the database (SQLite online backup)
//   uploads/       the uploaded logo, if any
//   manifest.json  when, why, size, integrity check result

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const BACKUP_KINDS = ["nightly", "startup", "manual", "before-restore"] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

export type BackupInfo = {
  id: string;
  kind: BackupKind;
  /** Unix ms. */
  createdAt: number;
  sizeBytes: number;
  /** "ok", or SQLite's integrity_check message. */
  integrity: string;
  /** Number of database migrations in the copy. */
  migrations: number;
};

export type Retention = { daily: number; monthly: number; yearly: number; recent: number };
/** 7 daily, 12 monthly, 5 yearly; the 3 newest are always kept whatever they are. */
export const DEFAULT_RETENTION: Retention = { daily: 7, monthly: 12, yearly: 5, recent: 3 };

const ID_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{6}_(nightly|startup|manual|before-restore)(-\d+)?$/;
const DB_NAME = "enyo.db";
const MANIFEST = "manifest.json";

export const isBackupId = (id: string) => ID_PATTERN.test(id);


const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const monthKey = (t: number) => dayKey(t).slice(0, 7);
const yearKey = (t: number) => dayKey(t).slice(0, 4);

function newId(dir: string, kind: BackupKind, now: Date): string {
  const base = `${dayKey(now.getTime())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${kind}`;
  let id = base;
  for (let n = 2; fs.existsSync(path.join(dir, id)); n++) id = `${base}-${n}`;
  return id;
}

/** Opens a database file read-only and checks it: integrity and migration count. */
export function checkDatabaseFile(file: string): { integrity: string; migrations: number } {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
    const integrity = rows.map((r) => r.integrity_check).join("; ");
    let migrations = 0;
    try {
      migrations = (db.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n;
    } catch {
      migrations = 0; // not an ENYO POS database
    }
    return { integrity, migrations };
  } finally {
    db.close();
  }
}

function copyDir(from: string, to: string) {
  if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true });
}

/**
 * Takes a consistent copy of a live database (SQLite's online backup, so the
 * till keeps working), copies the uploads folder, checks the copy and records
 * the result in a manifest.
 */
export async function createBackup(opts: {
  source: Database.Database;
  backupsDir: string;
  uploadsDir: string;
  kind: BackupKind;
  now?: Date;
}): Promise<BackupInfo> {
  const now = opts.now ?? new Date();
  fs.mkdirSync(opts.backupsDir, { recursive: true });
  const id = newId(opts.backupsDir, opts.kind, now);
  const dir = path.join(opts.backupsDir, id);
  const partial = `${dir}.partial`;
  fs.mkdirSync(partial, { recursive: true });
  try {
    await opts.source.backup(path.join(partial, DB_NAME));
    copyDir(opts.uploadsDir, path.join(partial, "uploads"));
    const check = checkDatabaseFile(path.join(partial, DB_NAME));
    const info: BackupInfo = {
      id,
      kind: opts.kind,
      createdAt: now.getTime(),
      sizeBytes: fs.statSync(path.join(partial, DB_NAME)).size,
      integrity: check.integrity,
      migrations: check.migrations,
    };
    fs.writeFileSync(path.join(partial, MANIFEST), JSON.stringify(info, null, 2));
    // Only a finished, checked backup gets its real name.
    fs.renameSync(partial, dir);
    return info;
  } catch (error) {
    fs.rmSync(partial, { recursive: true, force: true });
    throw error;
  }
}

/** Every backup in a folder, newest first. Folders without a readable manifest are ignored. */
export function listBackups(backupsDir: string): BackupInfo[] {
  if (!fs.existsSync(backupsDir)) return [];
  const found: BackupInfo[] = [];
  for (const entry of fs.readdirSync(backupsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isBackupId(entry.name)) continue;
    try {
      const info = JSON.parse(fs.readFileSync(path.join(backupsDir, entry.name, MANIFEST), "utf8")) as BackupInfo;
      if (info.id === entry.name && fs.existsSync(path.join(backupsDir, entry.name, DB_NAME))) found.push(info);
    } catch {
      // unreadable manifest: not a usable backup
    }
  }
  return found.sort((a, b) => b.createdAt - a.createdAt);
}

/** Which backups the retention rules keep (newest-first input). */
export function backupsToKeep(backups: BackupInfo[], keep: Retention = DEFAULT_RETENTION): Set<string> {
  const kept = new Set(backups.slice(0, keep.recent).map((b) => b.id));
  const newestPer = (key: (t: number) => string, count: number) => {
    const seen = new Set<string>();
    for (const b of backups) {
      const k = key(b.createdAt);
      if (seen.has(k)) continue;
      seen.add(k);
      if (seen.size > count) break;
      kept.add(b.id);
    }
  };
  newestPer(dayKey, keep.daily);
  newestPer(monthKey, keep.monthly);
  newestPer(yearKey, keep.yearly);
  return kept;
}

/** Deletes backups the retention rules don't keep. Returns the removed ids. */
export function pruneBackups(backupsDir: string, keep: Retention = DEFAULT_RETENTION): string[] {
  const all = listBackups(backupsDir);
  const kept = backupsToKeep(all, keep);
  const removed = all.filter((b) => !kept.has(b.id)).map((b) => b.id);
  for (const id of removed) fs.rmSync(path.join(backupsDir, id), { recursive: true, force: true });
  return removed;
}

/** Copies one backup folder into another backups folder (e.g. a USB drive) and prunes it there. */
export function copyBackupTo(backupsDir: string, id: string, targetDir: string, keep: Retention = DEFAULT_RETENTION): void {
  if (!isBackupId(id)) throw new Error("Not a backup.");
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, id);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(backupsDir, id), target, { recursive: true });
  pruneBackups(targetDir, keep);
}

export function backupDatabaseFile(backupsDir: string, id: string): string {
  if (!isBackupId(id)) throw new Error("Not a backup.");
  return path.join(backupsDir, id, DB_NAME);
}

/**
 * Checks a backup can be restored by this version of the app: it must pass
 * the integrity check, be an ENYO POS database, and not come from a newer
 * version (more migrations than this app knows).
 */
export function checkRestorable(backupsDir: string, id: string, appMigrations: number): string | null {
  const file = backupDatabaseFile(backupsDir, id);
  if (!fs.existsSync(file)) return "That backup no longer exists.";
  const check = checkDatabaseFile(file);
  if (check.integrity !== "ok") return "That backup failed its integrity check, so it can't be restored.";
  if (check.migrations === 0) return "That file isn't an ENYO POS backup.";
  if (check.migrations > appMigrations) return "That backup comes from a newer version of ENYO POS. Update this computer first.";
  return null;
}

/**
 * Replaces the live database and uploads with a backup's. The caller must have
 * closed every connection to the live database first, and must apply
 * migrations when it reopens it (the backup may be from an older version).
 */
export function restoreFiles(opts: { backupsDir: string; id: string; dbFile: string; uploadsDir: string }): void {
  const source = backupDatabaseFile(opts.backupsDir, opts.id);
  // The write-ahead log belongs to the old database; leaving it would corrupt the restored one.
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(opts.dbFile + suffix, { force: true });
  fs.mkdirSync(path.dirname(opts.dbFile), { recursive: true });
  fs.copyFileSync(source, opts.dbFile);
  fs.rmSync(opts.uploadsDir, { recursive: true, force: true });
  copyDir(path.join(opts.backupsDir, opts.id, "uploads"), opts.uploadsDir);
}
