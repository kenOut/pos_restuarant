import "server-only";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";
import { listBackups } from "./core";
import { backupsDir, getBackupStatus, runBackup } from "./service";

const globalForScheduler = globalThis as unknown as { enyoBackupTimer?: NodeJS.Timeout };

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

async function tick(firstRun: boolean) {
  // Nothing to back up until the restaurant has been set up.
  if (!getDb().select({ id: restaurants.id }).from(restaurants).limit(1).get()) return;
  const now = new Date();
  const backups = listBackups(backupsDir());

  if (firstRun && !backups.some((b) => sameDay(new Date(b.createdAt), now))) {
    await runBackup("startup");
    return;
  }

  const { time } = getBackupStatus();
  const [h, m] = time.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);
  const doneTonight = backups.some((b) => b.kind === "nightly" && b.createdAt >= scheduled.getTime());
  if (now >= scheduled && !doneTonight) await runBackup("nightly");
}

/**
 * Checks once a minute whether tonight's backup is due, and shortly after
 * start-up takes one if there's none from today. Errors are recorded by
 * runBackup and shown in Settings; they never stop the till.
 */
export function startBackupScheduler(): void {
  if (globalForScheduler.enyoBackupTimer) return;
  const safeTick = (first: boolean) => tick(first).catch((error) => console.error("[backups]", (error as Error).message));
  setTimeout(() => safeTick(true), 10_000).unref();
  globalForScheduler.enyoBackupTimer = setInterval(() => safeTick(false), 60_000);
  globalForScheduler.enyoBackupTimer.unref();
}
