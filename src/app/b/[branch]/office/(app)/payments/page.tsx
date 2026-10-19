import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, OfficeHeader, Pager, PeriodPicker, Stat, buttonLinkClass, selectClass, withQuery } from "@/components/office/parts";
import { MOMO_NETWORKS, PAYMENT_METHODS } from "@/db/enums";
import { formatCedis } from "@/lib/money";
import { listPayments, listStaffForFilters, paymentFiltersFrom, paymentTotals, resolveRange } from "@/lib/office/reports";
import { requireOffice } from "@/lib/office/session";
import { METHOD_LABELS, NETWORK_LABELS } from "@/lib/payments/labels";
import { branchPath, getDb } from "@/lib/tenancy/context";
import { formatOrderNumber } from "@/lib/orders/shared";

export const metadata: Metadata = { title: "Payments" };

const time = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const person = await requireOffice();
  const db = await getDb();
  const q = await searchParams;
  const range = resolveRange(q.period, q.from, q.to);
  const filters = paymentFiltersFrom(q, range);
  const page = Math.max(1, Number(q.page) || 1);
  const { rows, total, pages } = listPayments(db, person.restaurantId, filters, page);
  const totals = paymentTotals(db, person.restaurantId, filters);
  const path = await branchPath("/office/payments");
  const ordersPath = await branchPath("/office/orders");
  const keep = { method: filters.method, network: filters.network, staff: filters.staffId };
  const periodParams = { period: range.period, from: range.period === "custom" ? range.fromDay : null, to: range.period === "custom" ? range.toDay : null };
  const sum = totals.reduce((n, t) => n + t.amount, 0);

  return (
    <div>
      <OfficeHeader
        title="Payments"
        description={`${range.label} · ${total} payment${total === 1 ? "" : "s"} · ${formatCedis(sum)}`}
        actions={
          <a href={withQuery(await branchPath("/office/export/payments"), { ...keep, ...periodParams })} className={buttonLinkClass}>
            Download CSV
          </a>
        }
      />
      <div className="space-y-4 p-3 sm:p-4">
        <PeriodPicker path={path} range={range} keep={keep} />
        <form action={path} className="flex flex-wrap items-end gap-3">
          {Object.entries(periodParams).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <label className="text-sm text-cream-muted">
            Method
            <select name="method" defaultValue={filters.method ?? ""} className={selectClass}>
              <option value="">All</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-cream-muted">
            Network
            <select name="network" defaultValue={filters.network ?? ""} className={selectClass}>
              <option value="">All</option>
              {MOMO_NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {NETWORK_LABELS[n]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-cream-muted">
            Taken by
            <select name="staff" defaultValue={filters.staffId ?? ""} className={selectClass}>
              <option value="">Everyone</option>
              {listStaffForFilters(db, person.restaurantId).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonLinkClass}>
            Filter
          </button>
        </form>

        <section aria-labelledby="by-method">
          <h2 id="by-method" className="font-display text-xl font-semibold">
            Totals by method
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {totals.map((t) => (
              <Stat key={t.method} label={METHOD_LABELS[t.method]} value={formatCedis(t.amount)} note={`${t.count} payment${t.count === 1 ? "" : "s"}`} />
            ))}
          </dl>
        </section>

        {rows.length === 0 ? (
          <p className="rounded-2xl border border-ink-700 bg-ink-850 p-6 text-center text-cream-muted">No payments match.</p>
        ) : (
          <DataTable caption="Payments">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Order</th>
                <th scope="col">Method</th>
                <th scope="col">Account or reference</th>
                <th scope="col">Taken by</th>
                <th scope="col" className="text-right">Amount</th>
                <th scope="col" className="text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="tabular-nums">{time.format(p.createdAt)}</td>
                  <td>
                    <Link href={`${ordersPath}/${p.orderId}`} className="inline-flex min-h-11 min-w-11 items-center font-semibold text-amber underline-offset-4 hover:underline">
                      #{formatOrderNumber(p.orderNumber)}
                    </Link>
                  </td>
                  <td>
                    {METHOD_LABELS[p.method]}
                    {p.network ? ` · ${NETWORK_LABELS[p.network]}` : ""}
                  </td>
                  <td>{[p.account, p.reference].filter(Boolean).join(" · ") || "–"}</td>
                  <td>{p.staffName}</td>
                  <td className="text-right tabular-nums">{formatCedis(p.amount)}</td>
                  <td className="text-right tabular-nums">{p.change ? formatCedis(p.change) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
      <Pager path={path} page={page} pages={pages} params={{ ...keep, ...periodParams }} />
    </div>
  );
}
