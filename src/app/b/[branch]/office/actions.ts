"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createApiKey, revokeApiKey, setAllowedOrigins, type ApiKeyInfo } from "@/lib/api/keys";
import { endOfficeSession, requireOffice } from "@/lib/office/session";
import { branchPath, getDb } from "@/lib/tenancy/context";

type Result = { ok: true } | { ok: false; error: string };

export async function logoutOffice(): Promise<void> {
  await endOfficeSession();
  redirect(await branchPath("/office/login"));
}

/** Creates an API key; the key itself is returned only this once. */
export async function createApiKeyAction(name: string): Promise<{ ok: true; key: string; info: ApiKeyInfo } | { ok: false; error: string }> {
  const person = await requireOffice();
  const result = createApiKey(await getDb(), person, name);
  if (result.ok) revalidatePath("/b/[branch]", "layout");
  return result;
}

export async function revokeApiKeyAction(id: string): Promise<Result> {
  const person = await requireOffice();
  const result = revokeApiKey(await getDb(), person, id);
  if (result.ok) revalidatePath("/b/[branch]", "layout");
  return result;
}

export async function saveAllowedOriginsAction(text: string): Promise<Result> {
  const person = await requireOffice();
  const result = setAllowedOrigins(await getDb(), person, text);
  if (result.ok) revalidatePath("/b/[branch]", "layout");
  return result;
}
