"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSettingsAccess } from "@/lib/office/session";
import { publish } from "@/lib/live/bus";
import { canManageBackups, restoreBackup, runBackup, updateBackupSettings } from "@/lib/backups/service";
import { branchPath, getBranch } from "@/lib/tenancy/context";

export async function backupNowAction(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const person = await requireSettingsAccess();
  if (!canManageBackups(person.role)) return { ok: false, error: "Only an owner can back up." };
  try {
    const info = await runBackup(await getBranch(), "manual");
    revalidatePath("/b/[branch]", "layout");
    return { ok: true, id: info.id };
  } catch (error) {
    return { ok: false, error: `The backup failed: ${(error as Error).message}` };
  }
}

export async function updateBackupSettingsAction(input: { time: string; copyDir: string }) {
  const person = await requireSettingsAccess();
  const result = updateBackupSettings(await getBranch(), person, input);
  if (result.ok) revalidatePath("/b/[branch]", "layout");
  return result;
}

/** Restores a backup, then sends everyone (this owner included) to sign in again. */
export async function restoreBackupAction(id: string): Promise<{ ok: false; error: string }> {
  const person = await requireSettingsAccess();
  const result = await restoreBackup(await getBranch(), person, typeof id === "string" ? id : "");
  if (!result.ok) return result;
  // Every till refetches, finds its session gone and goes to the sign-in screen.
  publish(person.restaurantId, { type: "changed" });
  revalidatePath("/b/[branch]", "layout");
  redirect(await branchPath("/login?restored=1"));
}
