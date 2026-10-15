"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { startSession } from "@/lib/auth/session";
import { runSetup } from "@/lib/setup/service";

export type SetupState = { error: string } | null;

export async function setupAction(_previous: SetupState, formData: FormData): Promise<SetupState> {
  const pin = String(formData.get("pin") ?? "");
  if (pin !== String(formData.get("confirmPin") ?? "")) return { error: "The two PINs don't match." };
  const sampleMenu = formData.get("sampleMenu") === "on";

  const result = await runSetup(getDb(), {
    restaurantName: String(formData.get("restaurantName") ?? ""),
    ownerName: String(formData.get("ownerName") ?? ""),
    pin,
    sampleMenu,
  });
  if (!result.ok) return { error: result.error };

  await startSession(result.ownerId);
  // With the sample menu you can start taking orders; without it, add dishes first.
  redirect(sampleMenu ? "/order" : "/menu");
}
