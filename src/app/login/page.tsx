import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getControlDb } from "@/db";
import { branchUrl } from "@/lib/tenancy/context";
import { listBranches, needsSetup, organisationName } from "@/lib/tenancy/registry";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

/**
 * The website's "Sign in": goes straight to the branch when there's only one,
 * otherwise asks which branch (or head office).
 */
export default async function ChooseBranchPage() {
  const control = getControlDb();
  if (needsSetup(control)) redirect("/hq/setup");
  const branches = listBranches(control, { includeInactive: false });
  if (branches.length === 1) redirect(`${await branchUrl(branches[0].slug)}/login`);

  const links = await Promise.all(branches.map(async (b) => ({ ...b, url: `${await branchUrl(b.slug)}/login` })));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Logo size={36} />
      <h1 className="mt-8 font-display text-3xl font-bold">Which branch?</h1>
      {organisationName(control) ? <p className="mt-2 text-cream-muted">{organisationName(control)}</p> : null}
      <ul className="mt-6 space-y-3">
        {links.map((b) => (
          <li key={b.id}>
            <a
              href={b.url}
              className="flex min-h-14 items-center rounded-2xl border border-ink-700 bg-ink-850 px-4 font-semibold hover:border-amber"
            >
              {b.name}
            </a>
          </li>
        ))}
      </ul>
      <Link href="/hq/login" className="mt-8 inline-flex min-h-11 items-center text-amber underline-offset-4 hover:underline">
        Head office sign-in
      </Link>
    </main>
  );
}
