import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { HqLoginForm } from "@/components/hq/hq-forms";
import { getControlDb } from "@/db";
import { hasHqUsers } from "@/lib/hq/service";
import { getHqUser } from "@/lib/hq/session";
import { hqPath } from "@/lib/tenancy/context";
import { needsSetup } from "@/lib/tenancy/registry";

export const metadata: Metadata = { title: "Sign in" };

export default async function HqLoginPage() {
  const control = getControlDb();
  if (needsSetup(control)) redirect(await hqPath("/setup"));
  if (!hasHqUsers(control)) redirect(await hqPath("/claim"));
  if (await getHqUser()) redirect(await hqPath("/"));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Logo size={36} />
      <h1 className="mt-8 font-display text-3xl font-bold">Head office sign-in</h1>
      <p className="mt-2 text-cream-muted">For the owners who look after every branch. Staff sign in at their own branch with their PIN.</p>
      <HqLoginForm />
    </main>
  );
}
