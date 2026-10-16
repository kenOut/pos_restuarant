"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/tenancy/context";
import { requireStaff } from "@/lib/auth/session";
import { publish } from "@/lib/live/bus";
import { createStaff, resetPin, setStaffActive, unlockStaff, updateStaff, type StaffInput } from "@/lib/staff/service";

const str = (v: unknown) => (typeof v === "string" ? v : "");

async function after<T extends { ok: boolean }>(restaurantId: string, result: T): Promise<T> {
  if (result.ok) {
    revalidatePath("/b/[branch]", "layout");
    publish(restaurantId, { type: "changed" });
  }
  return result;
}

export async function createStaffAction(input: StaffInput, pin: string) {
  const person = await requireStaff("staff");
  return after(person.restaurantId, await createStaff((await getDb()), person, input, str(pin)));
}

export async function updateStaffAction(id: string, input: StaffInput) {
  const person = await requireStaff("staff");
  return after(person.restaurantId, updateStaff((await getDb()), person, str(id), input));
}

export async function resetPinAction(id: string, pin: string) {
  const person = await requireStaff("staff");
  return after(person.restaurantId, await resetPin((await getDb()), person, str(id), str(pin)));
}

export async function unlockStaffAction(id: string) {
  const person = await requireStaff("staff");
  return after(person.restaurantId, unlockStaff((await getDb()), person, str(id)));
}

export async function setStaffActiveAction(id: string, active: boolean) {
  const person = await requireStaff("staff");
  return after(person.restaurantId, setStaffActive((await getDb()), person, str(id), active === true));
}
