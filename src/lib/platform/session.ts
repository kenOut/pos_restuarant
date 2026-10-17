import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getPlatformDb, isOnline } from "@/db";
import { createAdminSession, deleteAdminSession, findAdmin, hasAdmins } from "./service";

const COOKIE = "enyo_admin";
/** The seller's cookie only goes to the seller's pages. */
const PATH = "/admin";

/** The seller's pages exist only on ENYO Online. */
export function requireOnline(): void {
  if (!isOnline()) notFound();
}

export async function startAdminSession(adminId: string): Promise<void> {
  const { token, expiresAt } = createAdminSession(getPlatformDb(), adminId);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "strict", path: PATH, expires: expiresAt, secure: process.env.ENYO_SECURE_COOKIES === "1" });
}

export const getAdmin = cache(async () => {
  requireOnline();
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? findAdmin(getPlatformDb(), token) : null;
});

export async function requireAdmin() {
  requireOnline();
  if (!hasAdmins(getPlatformDb())) redirect("/admin/setup");
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function endAdminSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) deleteAdminSession(getPlatformDb(), token);
  store.set(COOKIE, "", { path: PATH, maxAge: 0 });
}
