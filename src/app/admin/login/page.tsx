import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-platform/forms";
import { Logo } from "@/components/brand/logo";
import { getPlatformDb } from "@/db";
import { hasAdmins } from "@/lib/platform/service";
import { getAdmin } from "@/lib/platform/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage() {
  if (!hasAdmins(getPlatformDb())) redirect("/admin/setup");
  if (await getAdmin()) redirect("/admin");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Logo size={36} />
      <h1 className="mt-8 font-display text-3xl font-bold">ENYO Online</h1>
      <p className="mt-2 text-cream-muted">Seller sign-in. Restaurants sign in at their own address.</p>
      <AdminLoginForm />
    </main>
  );
}
