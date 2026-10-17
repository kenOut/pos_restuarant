import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminSetupForm } from "@/components/admin-platform/forms";
import { Logo } from "@/components/brand/logo";
import { getPlatformDb } from "@/db";
import { hasAdmins } from "@/lib/platform/service";

export const metadata: Metadata = { title: "Set up" };

export default function AdminSetupPage() {
  if (hasAdmins(getPlatformDb())) redirect("/admin/login");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Logo size={36} />
      <h1 className="mt-8 font-display text-3xl font-bold">Set up ENYO Online</h1>
      <p className="mt-2 text-cream-muted">Create the seller account that adds and looks after client restaurants on this server.</p>
      <AdminSetupForm />
    </main>
  );
}
