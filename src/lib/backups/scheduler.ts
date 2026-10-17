import "server-only";
import path from "node:path";
import { allTenants, branchDbFor, controlDbFor, type Branch, type Tenant } from "@/db";
import { restaurants } from "@/db/schema";
import { listBranches } from "@/lib/tenancy/registry";
import { createBackup, listBackups, pruneBackups } from "./core";
import { backupsDir, getBackupStatus, runBackup } from "./service";

const globalForScheduler = globalThis as unknown as { enyoBackupTimer?: NodeJS.Timeout };

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Head office database backups live next to it, in hq-backups. */
export const hqBackupsDir = (tenant: Tenant) => path.join(tenant.dataDir, "hq-backups");

async function tickBranch(tenant: Tenant, branch: Branch, firstRun: boolean, now: Date) {
  // Nothing to back up until the branch has its restaurant row.
  if (!branchDbFor(tenant, branch).select({ id: restaurants.id }).from(restaurants).limit(1).get()) return;
  const backups = listBackups(backupsDir(tenant, branch));

  if (firstRun && !backups.some((b) => sameDay(new Date(b.createdAt), now))) {
    await runBackup(tenant, branch, "startup");
    return;
  }

  const { time } = getBackupStatus(tenant, branch);
  const [h, m] = time.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);
  const doneTonight = backups.some((b) => b.kind === "nightly" && b.createdAt >= scheduled.getTime());
  if (now >= scheduled && !doneTonight) await runBackup(tenant, branch, "nightly");
}

/** The head office database (business, branch list, logins): once a day. */
async function tickHeadOffice(tenant: Tenant, now: Date) {
  const dir = hqBackupsDir(tenant);
  if (listBackups(dir).some((b) => sameDay(new Date(b.createdAt), now))) return;
  await createBackup({ source: controlDbFor(tenant).$client, backupsDir: dir, uploadsDir: path.join(dir, "no-uploads"), kind: "nightly" });
  pruneBackups(dir);
}

async function tick(firstRun: boolean) {
  const now = new Date();
  // Every business on this server (just one on a restaurant's computer).
  for (const tenant of allTenants()) {
    for (const branch of listBranches(controlDbFor(tenant), { includeInactive: false })) {
      // One branch failing (recorded and shown in its Settings) never stops the others.
      await tickBranch(tenant, branch, firstRun, now).catch((error) => console.error(`[backups] ${tenant.id}/${branch.slug}:`, (error as Error).message));
    }
    await tickHeadOffice(tenant, now).catch((error) => console.error(`[backups] ${tenant.id} head office:`, (error as Error).message));
  }
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
