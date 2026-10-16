"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getControlDb } from "@/db";
import { branches } from "@/db/control-schema";
import { getBranch, getBranchFiles, getDb } from "@/lib/tenancy/context";
import { requireSettingsAccess } from "@/lib/office/session";
import { publish } from "@/lib/live/bus";
import { removeLogo, setLogo, updateBusiness, updateDiscountApproval, updateTaxes } from "@/lib/settings/service";
import type { TaxConfig } from "@/lib/tax-config";

async function after<T extends { ok: boolean }>(restaurantId: string, result: T): Promise<T> {
  if (result.ok) {
    // Name, logo and taxes show on every till screen.
    revalidatePath("/b/[branch]", "layout");
    publish(restaurantId, { type: "changed" });
  }
  return result;
}

export async function updateBusinessAction(input: { name: string; receiptFooter: string }) {
  const person = await requireSettingsAccess();
  const result = updateBusiness(await getDb(), person, input);
  // Keep the name head office sees in step with the branch's own.
  if (result.ok) getControlDb().update(branches).set({ name: input.name.trim().replace(/s+/g, " ").slice(0, 60) }).where(eq(branches.id, (await getBranch()).id)).run();
  return after(person.restaurantId, result);
}

export async function updateTaxesAction(config: TaxConfig) {
  const person = await requireSettingsAccess();
  return after(person.restaurantId, updateTaxes((await getDb()), person, config));
}

export async function updateDiscountApprovalAction(needsApproval: boolean) {
  const person = await requireSettingsAccess();
  return after(person.restaurantId, updateDiscountApproval((await getDb()), person, needsApproval === true));
}

export async function uploadLogoAction(formData: FormData) {
  const person = await requireSettingsAccess();
  const file = formData.get("logo");
  if (!(file instanceof File)) return { ok: false as const, error: "Choose an image file." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return after(person.restaurantId, setLogo((await getDb()), person, (await getBranchFiles()).uploadsDir, bytes));
}

export async function removeLogoAction() {
  const person = await requireSettingsAccess();
  return after(person.restaurantId, removeLogo((await getDb()), person, (await getBranchFiles()).uploadsDir));
}
