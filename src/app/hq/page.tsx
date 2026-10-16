import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BranchControls } from "@/components/hq/branch-controls";
import { getBranchDb, getControlDb } from "@/db";
import { branchDay } from "@/lib/hq/service";
import { requireHq } from "@/lib/hq/session";
import { formatCedis } from "@/lib/money";
import { branchUrl, hqPath } from "@/lib/tenancy/context";
import { listBranches, organisationName } from "@/lib/tenancy/registry";
import { logoutAction } from "./actions";

export default async function HeadOfficePage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const user = await requireHq();
  const control = getControlDb();
  const { created } = await searchParams;
  const rows = await Promise.all(
    listBranches(control).map(async (branch) => ({
      branch,
      url: await branchUrl(branch.slug),
      day: branch.active ? branchDay(getBranchDb(branch), branch.id) : null,
    }))
  );
  const days = rows.flatMap((r) => (r.day ? [r.day] : []));
  const totals = {
    sales: days.reduce((sum, d) => sum + d.salesToday, 0),
    orders: days.reduce((sum, d) => sum + d.ordersToday, 0),
    openOrders: days.reduce((sum, d) => sum + d.openOrders, 0),
  };
  const newBranch = created ? rows.find((r) => r.branch.slug === created) : undefined;
  const buttonClass = "inline-flex min-h-11 items-center rounded-xl bg-amber px-4 font-semibold text-amber-ink hover:bg-[#f5b552]";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <Logo size={32} />
        <div className="ml-auto flex items-center gap-3 text-sm text-cream-muted">
          <span>{user.name}</span>
          <form action={logoutAction}>
            <button type="submit" className="min-h-11 rounded-xl border border-ink-600 px-4 font-semibold text-cream hover:bg-ink-800">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mt-8 flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-cream-muted">Head office</p>
          <h1 className="font-display text-3xl font-bold">{organisationName(control) ?? "Your business"}</h1>
        </div>
        <Link href={await hqPath("/branches/new")} className={buttonClass}>
          Add a branch
        </Link>
      </div>

      {newBranch ? (
        <p role="status" className="mt-6 rounded-xl bg-eating-soft px-4 py-3">
          <span className="font-semibold">{newBranch.branch.name}</span> is ready. Open it and sign in with the branch lead&rsquo;s PIN
          to add its staff.
        </p>
      ) : null}

      <section aria-labelledby="today" className="mt-8">
        <h2 id="today" className="font-display text-xl font-semibold">
          Today, all open branches
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ["Sales", formatCedis(totals.sales)],
            ["Paid orders", String(totals.orders)],
            ["Orders still open", String(totals.openOrders)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-ink-700 bg-ink-850 p-4">
              <dt className="text-sm text-cream-muted">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="branches" className="mt-10">
        <h2 id="branches" className="font-display text-xl font-semibold">
          Branches
        </h2>
        <p className="mt-1 text-sm text-cream-muted">Each branch keeps its own data. Open one to work in it with your PIN there.</p>
        <ul className="mt-4 space-y-3">
          {rows.map(({ branch, url, day }) => (
            <li key={branch.id} data-branch={branch.slug} className="rounded-2xl border border-ink-700 bg-ink-850 p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg font-semibold">
                    {branch.name}
                    {branch.active ? null : (
                      <span className="ml-2 rounded-full bg-ink-700 px-2 py-0.5 align-middle text-xs font-semibold text-cream">Closed</span>
                    )}
                  </h3>
                  <p className="text-sm break-all text-cream-faint">{url.replace(/^https?:\/\//, "")}</p>
                </div>
                {branch.active ? (
                  <div className="flex flex-wrap gap-2">
                    <a href={`${url}/office`} aria-label={`Back office of ${branch.name}`} className="inline-flex min-h-11 items-center rounded-xl border border-ink-600 px-4 font-semibold hover:bg-ink-800">
                      Back office
                    </a>
                    <a href={`${url}/login`} aria-label={`Open ${branch.name}`} className={buttonClass}>
                      Open
                    </a>
                  </div>
                ) : null}
              </div>
              {day ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                  {[
                    ["Sales today", formatCedis(day.salesToday)],
                    ["Paid orders", day.ordersToday],
                    ["Open orders", day.openOrders],
                    ["Staff", day.activeStaff],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-cream-muted">{label}</dt>
                      <dd className="font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <div className="mt-3">
                <BranchControls branch={{ id: branch.id, name: branch.name, active: branch.active }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
