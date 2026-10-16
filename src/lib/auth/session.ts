import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { branchBase, branchPath, getDb } from "@/lib/tenancy/context";
import { canAccess, homePathFor, type TillArea } from "./roles";
import { createSession, deleteSession, findSessionStaff, type SessionStaff } from "./service";

const COOKIE = "enyo_session";

/**
 * The cookie only goes to this branch: on its own subdomain browsers keep
 * cookies per host anyway, and on /b/<slug> addresses the cookie's path keeps
 * it there. The token is also only stored in this branch's database.
 */
async function cookiePath(): Promise<string> {
  return (await branchBase()) || "/";
}

export async function startSession(staffId: string): Promise<void> {
  const { token, expiresAt } = createSession(await getDb(), staffId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: await cookiePath(),
    expires: expiresAt,
    // Tills usually reach the main computer over plain http on the local network,
    // where a Secure cookie would never be sent. Turn this on when serving over https.
    secure: process.env.ENYO_SECURE_COOKIES === "1",
  });
}

/** The signed-in person at this request's branch, or null. Cached per request. */
export const getCurrentStaff = cache(async (): Promise<SessionStaff | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? findSessionStaff(await getDb(), token) : null;
});

/**
 * Use at the top of every till page and server action. Sends signed-out
 * visitors to this branch's sign-in and people without access to their own home screen.
 */
export async function requireStaff(area?: TillArea): Promise<SessionStaff> {
  const person = await getCurrentStaff();
  if (!person) redirect(await branchPath("/login"));
  if (area && !canAccess(person.role, area)) redirect(await branchPath(homePathFor(person.role)));
  return person;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) deleteSession(await getDb(), token);
  store.set(COOKIE, "", { path: await cookiePath(), maxAge: 0 });
}
