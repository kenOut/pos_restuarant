"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { controlDbFor, getPlatformDb, tenantFor } from "@/db";
import { businesses } from "@/db/platform-schema";
import { eq } from "drizzle-orm";
import { checkAdminLogin, createBusiness, createFirstAdmin, renewSetupCode, setBusinessActive } from "@/lib/platform/service";
import { endAdminSession, requireAdmin, requireOnline, startAdminSession } from "@/lib/platform/session";
import { needsSetup } from "@/lib/tenancy/registry";

export type AdminFormState = { error: string } | null;
const text = (data: FormData, key: string) => String(data.get(key) ?? "");

export async function adminSetupAction(_: AdminFormState, data: FormData): Promise<AdminFormState> {
  requireOnline();
  const result = await createFirstAdmin(getPlatformDb(), process.env.ENYO_ADMIN_SETUP_CODE, {
    code: text(data, "code"),
    name: text(data, "name"),
    email: text(data, "email"),
    password: text(data, "password"),
  });
  if (!result.ok) return { error: result.error };
  await startAdminSession(result.adminId);
  redirect("/admin");
}

export async function adminLoginAction(_: AdminFormState, data: FormData): Promise<AdminFormState> {
  requireOnline();
  const result = await checkAdminLogin(getPlatformDb(), text(data, "email"), text(data, "password"));
  if (!result.ok) return { error: result.error };
  await startAdminSession(result.adminId);
  redirect("/admin");
}

export async function adminLogoutAction(): Promise<void> {
  await endAdminSession();
  redirect("/admin/login");
}

/** A new client business; its setup link is returned only this once. */
export async function createBusinessAction(input: { name: string; slug: string }): Promise<{ ok: true; slug: string; setupCode: string } | { ok: false; error: string }> {
  await requireAdmin();
  const result = createBusiness(getPlatformDb(), input);
  if (!result.ok) return result;
  revalidatePath("/admin");
  return { ok: true, slug: result.business.slug, setupCode: result.setupCode };
}

export async function renewSetupLinkAction(businessId: string): Promise<{ ok: true; slug: string; setupCode: string } | { ok: false; error: string }> {
  await requireAdmin();
  const platform = getPlatformDb();
  const business = platform.select().from(businesses).where(eq(businesses.id, String(businessId))).get();
  if (!business) return { ok: false, error: "That business no longer exists." };
  const result = renewSetupCode(platform, business.id, !needsSetup(controlDbFor(tenantFor(business))));
  return result.ok ? { ok: true, slug: business.slug, setupCode: result.setupCode } : result;
}

export async function setBusinessActiveAction(businessId: string, active: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const result = setBusinessActive(getPlatformDb(), businessId, active === true);
  if (result.ok) revalidatePath("/admin");
  return result;
}
