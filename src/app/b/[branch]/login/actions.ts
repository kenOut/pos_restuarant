"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/tenancy/context";
import { homePathFor } from "@/lib/auth/roles";
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
  if (!result.ok) {
    switch (result.reason) {
      case "unknown":
        return { error: "That person can't sign in on this till. Ask a manager." };
      case "locked": {
        const minutes = Math.max(1, Math.ceil((result.lockedUntil.getTime() - Date.now()) / 60_000));
        return { error: `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask a manager.` };
      }
      case "invalid":
        return {
          error:
            result.attemptsLeft <= 2
              ? `Wrong PIN. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? "try" : "tries"} left before a 5-minute lock.`
              : "Wrong PIN. Try again.",
        };
    }
  }

  await startSession(result.staff.id);
  redirect(await branchPath(homePathFor(result.staff.role)));
}
