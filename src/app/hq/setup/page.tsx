import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { HqSetupForm } from "@/components/hq/hq-forms";
import { getControlDb } from "@/db";
import { hqPath } from "@/lib/tenancy/context";
import { needsSetup } from "@/lib/tenancy/registry";

export const metadata: Metadata = { title: "Set up" };

export default async function HqSetupPage() {
  // Only a brand-new install can be set up.
  if (!needsSetup(getControlDb())) redirect(await hqPath("/login"));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <Logo size={36} />
      <h1 className="mt-8 font-display text-3xl font-bold">Set up ENYO POS</h1>
      <p className="mt-2 text-cream-muted">
        Create your business, your head office sign-in and your first branch. You can add more branches afterwards; each one
        keeps its own data.
      </p>
      <HqSetupForm />
    </main>
  );
}
