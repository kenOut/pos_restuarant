import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { canAccess, homePathFor, type TillArea } from "./roles";
import { createSession, deleteSession, findSessionStaff, type SessionStaff } from "./service";

const COOKIE = "enyo_session";

export async function startSession(staffId: string): Promise<void> {
  const { token, expiresAt } = createSession(getDb(), staffId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    // Tills usually reach the main computer over plain http on the local network,
    // where a Secure cookie would never be sent. Turn this on when serving over https.
    secure: process.env.ENYO_SECURE_COOKIES === "1",
  });
}

/** The signed-in person for this request, or null. Cached per request. */
export const getCurrentStaff = cache(async (): Promise<SessionStaff | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? findSessionStaff(getDb(), token) : null;
});

/**
 * Use at the top of every till page and server action. Sends signed-out
 * visitors to /login and people without access to their own home screen.
 */
export async function requireStaff(area?: TillArea): Promise<SessionStaff> {
  const person = await getCurrentStaff();
  if (!person) redirect("/login");
  if (area && !canAccess(person.role, area)) redirect(homePathFor(person.role));
  return person;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) deleteSession(getDb(), token);
  store.delete(COOKIE);
}
