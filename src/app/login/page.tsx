import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { isOnline } from "@/db";
import { branchUrl, businessSlug, getControl, hqPath } from "@/lib/tenancy/context";
import { listBranches, needsSetup, organisationName } from "@/lib/tenancy/registry";
import { slugify } from "@/lib/tenancy/slug";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

/**
 * The website's "Sign in": goes straight to the branch when there's only one,
 * otherwise asks which branch (or head office).
 */
export default async function ChooseBranchPage({ searchParams }: { searchParams: Promise<{ restaurant?: string }> }) {
  // ENYO Online with no business in the address: ask which restaurant.
  if (isOnline() && !(await businessSlug())) {
    const wanted = slugify(String((await searchParams).restaurant ?? ""));
    if (wanted) redirect(`/c/${wanted}/login`);
    return <FindRestaurant />;
  }
  const control = await getControl();
  if (needsSetup(control)) {
    // On ENYO Online a new business is set up from its one-time link only.
    if (isOnline()) return <NotSetUp />;
    redirect(await hqPath("/setup"));
  }
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
      <Link href={await hqPath("/login")} className="mt-8 inline-flex min-h-11 items-center text-amber underline-offset-4 hover:underline">
        Head office sign-in
      </Link>
    </main>
  );
}

function FindRestaurant() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Logo size={36} />
      <h1 className="mt-8 font-display text-3xl font-bold">Find your restaurant</h1>
      <p className="mt-2 text-cream-muted">Enter your restaurant&rsquo;s address name, as ENYO gave it to you, e.g. mamaakos.</p>
      <form action="/login" className="mt-6 flex gap-2">
        <label htmlFor="restaurant" className="sr-only">
          Restaurant address name
        </label>
        <input
          id="restaurant"
          name="restaurant"
          required
          maxLength={32}
          autoCapitalize="none"
          spellCheck={false}
          className="h-12 min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-900 px-3 text-cream focus:border-amber focus:outline-none"
        />
        <button type="submit" className="min-h-12 rounded-xl bg-amber px-5 font-semibold text-amber-ink hover:bg-[#f5b552]">
          Go
        </button>
      </form>
    </main>
  );
}

function NotSetUp() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Logo size={36} />
      <h1 className="mt-8 font-display text-3xl font-bold">Not set up yet</h1>
      <p className="mt-2 text-cream-muted">This restaurant hasn&rsquo;t been set up yet. Use the setup link ENYO sent you.</p>
    </main>
  );
}
