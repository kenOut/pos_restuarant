import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { SetupForm } from "@/components/setup/setup-form";
import { getDb } from "@/db";
import { needsSetup } from "@/lib/setup/service";

export const metadata: Metadata = { title: "Set up" };

// Checked on every request: whether setup is needed depends on this computer's database,
// so the page must never be pre-rendered at build time.
export const dynamic = "force-dynamic";

export default function SetupPage() {
  // Only a brand-new main computer can be set up.
  if (!needsSetup(getDb())) redirect("/login");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <Logo size={36} />
      <h1 className="mt-8 font-display text-3xl font-bold">Set up this restaurant</h1>
      <p className="mt-2 text-cream-muted">
        This computer will be the restaurant&rsquo;s main computer: it keeps the data, and tills, tablets and the kitchen screen
        connect to it. You&rsquo;ll be the owner, and can add staff afterwards.
      </p>
      <SetupForm />
    </main>
  );
}
