"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/tenancy/context";
import { homePathFor } from "@/lib/auth/roles";
import { pinFailureMessage } from "@/lib/auth/pin-messages";
import { PIN_PATTERN, checkPin } from "@/lib/auth/service";
import { startSession } from "@/lib/auth/session";
import { branchPath } from "@/lib/tenancy/context";

export type SignInState = { error: string } | null;

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const staffId = String(formData.get("staffId") ?? "");
  const pin = String(formData.get("pin") ?? "");

  if (!staffId) return { error: "Tap your name first." };
  if (!PIN_PATTERN.test(pin)) return { error: "Enter your 4-digit PIN." };

  const result = await checkPin((await getDb()), staffId, pin);
  if (!result.ok) return { error: pinFailureMessage(result) };

  await startSession(result.staff.id);
  redirect(await branchPath(homePathFor(result.staff.role)));
}
