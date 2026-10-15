"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requireStaff } from "@/lib/auth/session";
import { publish } from "@/lib/live/bus";
import { createStaff, resetPin, setStaffActive, unlockStaff, updateStaff, type StaffInput } from "@/lib/staff/service";

const str = (v: unknown) => (typeof v === "string" ? v : "");

async function after<T extends { ok: boolean }>(restaurantId: string, result: T): Promise<T> {
  if (result.ok) {
    revalidatePath("/staff");
    publish(restaurantId, { type: "changed" });
  }
  return result;
}

export async function createStaffAction(input: StaffInput, pin: string) {
  const person = await requireStaff("staff");
  return after(person.restaurantId, await createStaff(getDb(), person, input, str(pin)));
}

export async function updateStaffAction(id: string, input: StaffInput) {
  const person = await requireStaff("staff");
  return after(person.restaurantId, updateStaff(getDb(), person, str(id), input));
}

export async function resetPinAction(id: string, pin: string) {
  const person = await requireStaff("staff");
  return after(person.restaurantId, await resetPin(getDb(), person, str(id), str(pin)));
}

export async function unlockStaffAction(id: string) {
  const person = await requireStaff("staff");
  return after(person.restaurantId, unlockStaff(getDb(), person, str(id)));
}

export async function setStaffActiveAction(id: string, active: boolean) {
  const person = await requireStaff("staff");
  return after(person.restaurantId, setStaffActive(getDb(), person, str(id), active === true));
}
