"use server";

import { redirect } from "next/navigation";
import type { SignInState } from "@/app/b/[branch]/login/actions";
import { pinFailureMessage } from "@/lib/auth/pin-messages";
import { PIN_PATTERN, checkPin } from "@/lib/auth/service";
import { canUseOffice, startOfficeSession } from "@/lib/office/session";
import { branchPath, getDb } from "@/lib/tenancy/context";

/** Back office sign-in: the same PIN as on the till, for owners and managers. */
export async function officeSignIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const staffId = String(formData.get("staffId") ?? "");
  const pin = String(formData.get("pin") ?? "");
  if (!staffId) return { error: "Tap your name first." };
  if (!PIN_PATTERN.test(pin)) return { error: "Enter your 4-digit PIN." };

  const result = await checkPin(await getDb(), staffId, pin);
  if (!result.ok) return { error: pinFailureMessage(result) };
  if (!canUseOffice(result.staff.role)) return { error: "The back office is for owners and managers." };

  await startOfficeSession(result.staff.id);
  redirect(await branchPath("/office"));
}
