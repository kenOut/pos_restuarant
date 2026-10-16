import "server-only";
import path from "node:path";
import { getBranchDb, getControlDb, getDataDir, type Branch } from "@/db";
import { restaurants } from "@/db/schema";
import { listBranches } from "@/lib/tenancy/registry";
import { createBackup, listBackups, pruneBackups } from "./core";
import { backupsDir, getBackupStatus, runBackup } from "./service";

const globalForScheduler = globalThis as unknown as { enyoBackupTimer?: NodeJS.Timeout };

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Head office database backups live next to it, in data/hq-backups. */
export const hqBackupsDir = () => path.join(getDataDir(), "hq-backups");

async function tickBranch(branch: Branch, firstRun: boolean, now: Date) {
  // Nothing to back up until the branch has its restaurant row.
  if (!getBranchDb(branch).select({ id: restaurants.id }).from(restaurants).limit(1).get()) return;
  const backups = listBackups(backupsDir(branch));

  if (firstRun && !backups.some((b) => sameDay(new Date(b.createdAt), now))) {
    await runBackup(branch, "startup");
    return;
  }

  const { time } = getBackupStatus(branch);
  const [h, m] = time.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);
  const doneTonight = backups.some((b) => b.kind === "nightly" && b.createdAt >= scheduled.getTime());
  if (now >= scheduled && !doneTonight) await runBackup(branch, "nightly");
}

/** The head office database (business, branch list, logins): once a day. */
async function tickHeadOffice(now: Date) {
  const dir = hqBackupsDir();
  if (listBackups(dir).some((b) => sameDay(new Date(b.createdAt), now))) return;
  await createBackup({ source: getControlDb().$client, backupsDir: dir, uploadsDir: path.join(dir, "no-uploads"), kind: "nightly" });
  pruneBackups(dir);
}

async function tick(firstRun: boolean) {
  const now = new Date();
  for (const branch of listBranches(getControlDb(), { includeInactive: false })) {
    // One branch failing (recorded and shown in its Settings) never stops the others.
    await tickBranch(branch, firstRun, now).catch((error) => console.error(`[backups] ${branch.slug}:`, (error as Error).message));
  }
  await tickHeadOffice(now).catch((error) => console.error("[backups] head office:", (error as Error).message));
}

/**
 * Checks once a minute whether tonight's backups are due, and shortly after
 * start-up backs up any branch that has none from today.
 */
export function startBackupScheduler(): void {
  if (globalForScheduler.enyoBackupTimer) return;
  setTimeout(() => void tick(true), 10_000).unref();
  globalForScheduler.enyoBackupTimer = setInterval(() => void tick(false), 60_000);
  globalForScheduler.enyoBackupTimer.unref();
}
