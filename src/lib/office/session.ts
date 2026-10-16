import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { StaffRole } from "@/db/schema";
import { createSession, deleteSession, findSessionStaff, type SessionStaff } from "@/lib/auth/service";
import { requireStaff } from "@/lib/auth/session";
import { branchPath, getDb } from "@/lib/tenancy/context";

const COOKIE = "enyo_office";

/** The back office is for owners and managers. */
export const OFFICE_ROLES: readonly StaffRole[] = ["owner", "manager"];
export const canUseOffice = (role: StaffRole) => OFFICE_ROLES.includes(role);

/**
 * The cookie only goes to this branch's back office pages (and not to the
 * till's), and the session in the database is of the "office" kind, so the
 * till's cookie never opens the back office or the other way round.
 */
async function cookiePath(): Promise<string> {
  return branchPath("/office");
}

export async function startOfficeSession(staffId: string): Promise<void> {
  const { token } = createSession(await getDb(), staffId, new Date(), "office");
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: await cookiePath(),
    // The 30-minute idle limit is kept in the database; the cookie itself lasts one shift.
    maxAge: 12 * 60 * 60,
    secure: process.env.ENYO_SECURE_COOKIES === "1",
  });
}

/** The person signed in to this branch's back office, or null. Cached per request. */
export const getOfficeStaff = cache(async (): Promise<SessionStaff | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const person = findSessionStaff(await getDb(), token, new Date(), "office");
  // Someone moved off owner or manager since signing in loses access at once.
  return person && canUseOffice(person.role) ? person : null;
});

/** Use at the top of every back office page and action. */
export async function requireOffice(): Promise<SessionStaff> {
  const person = await getOfficeStaff();
  if (!person) redirect(await branchPath("/office/login"));
  return person;
}

/** Settings can be changed from the till or the back office: whichever this request is signed in to. */
export async function requireSettingsAccess(): Promise<SessionStaff> {
  return (await getOfficeStaff()) ?? requireStaff("settings");
}

export async function endOfficeSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) deleteSession(await getDb(), token);
  store.set(COOKIE, "", { path: await cookiePath(), maxAge: 0 });
}
