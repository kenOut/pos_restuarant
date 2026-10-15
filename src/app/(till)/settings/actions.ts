"use server";

import { revalidatePath } from "next/cache";
import { getDb, getUploadsDir } from "@/db";
import { requireStaff } from "@/lib/auth/session";
import { publish } from "@/lib/live/bus";
import { removeLogo, setLogo, updateBusiness, updateDiscountApproval, updateTaxes } from "@/lib/settings/service";
import type { TaxConfig } from "@/lib/tax-config";

async function after<T extends { ok: boolean }>(restaurantId: string, result: T): Promise<T> {
  if (result.ok) {
    // Name, logo and taxes show on every till screen.
    revalidatePath("/", "layout");
    publish(restaurantId, { type: "changed" });
  }
  return result;
}

export async function updateBusinessAction(input: { name: string; receiptFooter: string }) {
  const person = await requireStaff("settings");
  return after(person.restaurantId, updateBusiness(getDb(), person, input));
}

export async function updateTaxesAction(config: TaxConfig) {
  const person = await requireStaff("settings");
  return after(person.restaurantId, updateTaxes(getDb(), person, config));
}

export async function updateDiscountApprovalAction(needsApproval: boolean) {
  const person = await requireStaff("settings");
  return after(person.restaurantId, updateDiscountApproval(getDb(), person, needsApproval === true));
}

export async function uploadLogoAction(formData: FormData) {
  const person = await requireStaff("settings");
  const file = formData.get("logo");
  if (!(file instanceof File)) return { ok: false as const, error: "Choose an image file." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return after(person.restaurantId, setLogo(getDb(), person, getUploadsDir(), bytes));
}

export async function removeLogoAction() {
  const person = await requireStaff("settings");
  return after(person.restaurantId, removeLogo(getDb(), person, getUploadsDir()));
}
