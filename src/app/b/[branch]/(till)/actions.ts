"use server";

import { redirect } from "next/navigation";
import { endSession } from "@/lib/auth/session";
import { branchPath } from "@/lib/tenancy/context";

/** Lock the till: end this person's session and return to the sign-in screen. */
export async function lockTill(): Promise<void> {
  await endSession();
  redirect(await branchPath("/login"));
}
