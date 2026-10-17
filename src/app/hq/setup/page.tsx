import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { HqSetupForm } from "@/components/hq/hq-forms";
import { getPlatformDb, isOnline } from "@/db";
import { checkSetupCode } from "@/lib/platform/service";
import { businessSlug, getControl, hqPath } from "@/lib/tenancy/context";
import { needsSetup } from "@/lib/tenancy/registry";

export const metadata: Metadata = { title: "Set up" };

export default async function HqSetupPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  // Only a brand-new business can be set up.
  if (!needsSetup(await getControl())) redirect(await hqPath("/login"));
  const { code } = await searchParams;
  const slug = await businessSlug();
  const linkOk = !isOnline() || (!!slug && typeof code === "string" && checkSetupCode(getPlatformDb(), slug, code));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <Logo size={36} />
      <h1 className="mt-8 font-display text-3xl font-bold">Set up ENYO POS</h1>
      {linkOk ? (
        <>
          <p className="mt-2 text-cream-muted">
            Create your business, your head office sign-in and your first branch. You can add more branches afterwards; each one
            keeps its own data.
          </p>
          <HqSetupForm setupCode={isOnline() ? code : undefined} />
        </>
      ) : (
        <p role="alert" className="mt-4 text-cream-muted">
          This setup link isn&rsquo;t valid or has expired. Ask ENYO for a new one.
        </p>
      )}
    </main>
  );
}
