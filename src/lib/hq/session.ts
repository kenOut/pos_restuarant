import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getControlDb } from "@/db";
import { needsSetup } from "@/lib/tenancy/registry";
import { hqBase, hqPath } from "@/lib/tenancy/context";
import { createHqSession, deleteHqSession, findHqSessionUser, hasHqUsers, type HqSessionUser } from "./service";

const COOKIE = "enyo_hq";

/** Head office's cookie never goes to branch screens: it's scoped to /hq (or to the hq subdomain). */
async function cookiePath(): Promise<string> {
  return (await hqBase()) || "/";
}

export async function startHqSession(userId: string): Promise<void> {
  const { token, expiresAt } = createHqSession(getControlDb(), userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: await cookiePath(),
    expires: expiresAt,
    secure: process.env.ENYO_SECURE_COOKIES === "1",
  });
}

export const getHqUser = cache(async (): Promise<HqSessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? findHqSessionUser(getControlDb(), token) : null;
});

/**
 * Use at the top of every head office page and action. A brand-new install
 * goes to setup, an upgraded one without a head office login to claim, and
 * everyone else who isn't signed in to the head office sign-in.
 */
export async function requireHq(): Promise<HqSessionUser> {
  const control = getControlDb();
  if (needsSetup(control)) redirect(await hqPath("/setup"));
  if (!hasHqUsers(control)) redirect(await hqPath("/claim"));
  const user = await getHqUser();
  if (!user) redirect(await hqPath("/login"));
  return user;
}

export async function endHqSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) deleteHqSession(getControlDb(), token);
  store.set(COOKIE, "", { path: await cookiePath(), maxAge: 0 });
}
