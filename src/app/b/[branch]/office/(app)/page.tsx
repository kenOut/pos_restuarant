import type { Metadata } from "next";
import Link from "next/link";
import { LiveOrders } from "@/components/office/live-orders";
import { openConflictCount } from "@/lib/sync/review";
import { OfficeHeader, PeriodPicker, Stat } from "@/components/office/parts";
import { formatCedis } from "@/lib/money";
import { getSummary, listActiveOrders, resolveRange } from "@/lib/office/reports";
import { requireOffice } from "@/lib/office/session";
import { METHOD_LABELS } from "@/lib/payments/labels";
import { branchPath, getDb } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const person = await requireOffice();
  const db = await getDb();
  const q = await searchParams;
  const range = resolveRange(q.period, q.from, q.to);
  const s = getSummary(db, person.restaurantId, range);
  const active = listActiveOrders(db, person.restaurantId);
  const flagged = openConflictCount(db.$client);
  const most = Math.max(1, ...s.byMethod.map((m) => m.amount));

  return (
    <div>
      <OfficeHeader title="Dashboard" description={range.label} actions={<PeriodPicker path={await branchPath("/office")} range={range} />} />
      <div className="space-y-8 p-3 sm:p-4">
        {flagged ? (
          <p role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-alert bg-alert-soft px-4 py-3">
            <span>
              Sync flagged {flagged} thing{flagged === 1 ? "" : "s"} that need{flagged === 1 ? "s" : ""} a look.
            </span>
            <Link href={await branchPath("/office/sync")} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold text-ink-950">
              Open Sync
            </Link>
          </p>
        ) : null}
        <section aria-labelledby="totals">
          <h2 id="totals" className="sr-only">
            Totals
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Total orders" value={String(s.orders)} note="Paid in full in this period" />
            <Stat label="Total sales" value={formatCedis(s.sales)} note={`Average order ${formatCedis(s.averageOrder)}`} />
            <Stat label="Total payments" value={formatCedis(s.payments)} note="Money taken, part payments included" />
            <Stat label="Active orders" value={String(s.activeOrders)} note={`${formatCedis(s.activeValue)} still open`} />
          </dl>
        </section>

        <section aria-labelledby="methods">
          <h2 id="methods" className="font-display text-xl font-semibold">
            Payments by method
          </h2>
          <ul className="mt-3 space-y-2">
            {s.byMethod.map((m) => (
              <li key={m.method} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_9rem]">
                <span>{METHOD_LABELS[m.method]}</span>
                <span aria-hidden className="h-3 overflow-hidden rounded-full bg-ink-800">
                  <span className="block h-full rounded-full bg-amber" style={{ width: `${(m.amount / most) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">
                  {formatCedis(m.amount)} <span className="text-cream-faint">· {m.count}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="live">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="live" className="font-display text-xl font-semibold">
              Live orders
            </h2>
            <p className="text-sm text-cream-muted">Updates as tills and the kitchen work. Red: open 45 minutes or more.</p>
          </div>
          <div className="mt-3">
            <LiveOrders orders={active} />
          </div>
        </section>
      </div>
    </div>
  );
}
