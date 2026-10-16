import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/office/print-button";
import { DataTable, OfficeHeader, PeriodPicker, Stat, buttonLinkClass, withQuery } from "@/components/office/parts";
import { formatCedis } from "@/lib/money";
import { getReports, resolveRange } from "@/lib/office/reports";
import { requireOffice } from "@/lib/office/session";
import { METHOD_LABELS, NETWORK_LABELS } from "@/lib/payments/labels";
import { branchPath, getDb } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Reports" };

const dayName = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const hourName = (h: number) => `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`;

function Report({ id, title, note, csv, children }: { id: string; title: string; note?: string; csv: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="break-inside-avoid space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={id} className="font-display text-xl font-semibold">
            {title}
          </h2>
          {note ? <p className="text-sm text-cream-muted">{note}</p> : null}
        </div>
        <a href={csv} className={`${buttonLinkClass} print:hidden`}>
          CSV
        </a>
      </div>
      {children}
    </section>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const person = await requireOffice();
  const q = await searchParams;
  const range = resolveRange(q.period, q.from, q.to);
  const r = getReports(await getDb(), person.restaurantId, range);
  const periodParams = { period: range.period, from: range.period === "custom" ? range.fromDay : null, to: range.period === "custom" ? range.toDay : null };
  const exportBase = await branchPath("/office/export");
  const csv = (report: string) => withQuery(`${exportBase}/${report}`, periodParams);
  const busiest = Math.max(1, ...r.byHour.map((h) => h.orders));

  return (
    <div>
      <OfficeHeader title="Reports" description={range.label} actions={<PrintButton />} />
      <div className="space-y-10 p-3 sm:p-4">
        <div className="print:hidden">
          <PeriodPicker path={await branchPath("/office/reports")} range={range} />
        </div>
        <dl className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Stat label="Orders" value={String(r.summary.orders)} />
          <Stat label="Sales" value={formatCedis(r.summary.sales)} note="Taxes and tips included" />
          <Stat label="Net sales" value={formatCedis(r.summary.netSales)} note="Less taxes and tips" />
          <Stat label="Taxes collected" value={formatCedis(r.summary.taxes)} />
          <Stat label="Tips" value={formatCedis(r.summary.tips)} />
          <Stat label="Discounts" value={formatCedis(r.summary.discounts)} />
        </dl>

        <Report id="by-day" title="Sales by day" note="Orders paid in full, by the day they were paid." csv={csv("days")}>
          <DataTable caption="Sales by day">
            <thead>
              <tr><th scope="col">Day</th><th scope="col" className="text-right">Orders</th><th scope="col" className="text-right">Discounts</th><th scope="col" className="text-right">Tips</th><th scope="col" className="text-right">Sales</th></tr>
            </thead>
            <tbody>
              {r.byDay.map((d) => (
                <tr key={d.day}>
                  <td>{dayName.format(new Date(`${d.day}T12:00:00`))}</td>
                  <td className="text-right tabular-nums">{d.orders}</td>
                  <td className="text-right tabular-nums">{formatCedis(d.discounts)}</td>
                  <td className="text-right tabular-nums">{formatCedis(d.tips)}</td>
                  <td className="text-right tabular-nums">{formatCedis(d.sales)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Report>

        <Report id="by-item" title="Sales by dish" note="Before discounts, at the price each was sold for." csv={csv("dishes")}>
          {r.byItem.length === 0 ? <p className="text-cream-muted">Nothing sold in this period.</p> : (
            <DataTable caption="Sales by dish">
              <thead><tr><th scope="col">Dish</th><th scope="col">Category</th><th scope="col" className="text-right">Sold</th><th scope="col" className="text-right">Amount</th></tr></thead>
              <tbody>
                {r.byItem.map((i) => (
                  <tr key={`${i.name}:${i.category}`}><td>{i.name}</td><td>{i.category}</td><td className="text-right tabular-nums">{i.quantity}</td><td className="text-right tabular-nums">{formatCedis(i.gross)}</td></tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Report>

        <Report id="by-category" title="Sales by category" note="Before discounts." csv={csv("categories")}>
          {r.byCategory.length === 0 ? <p className="text-cream-muted">Nothing sold in this period.</p> : (
            <DataTable caption="Sales by category">
              <thead><tr><th scope="col">Category</th><th scope="col" className="text-right">Sold</th><th scope="col" className="text-right">Amount</th></tr></thead>
              <tbody>
                {r.byCategory.map((c) => (
                  <tr key={c.category}><td>{c.category}</td><td className="text-right tabular-nums">{c.quantity}</td><td className="text-right tabular-nums">{formatCedis(c.gross)}</td></tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Report>

        <Report id="by-server" title="Sales by server" note="Whoever looks after each order." csv={csv("servers")}>
          {r.byServer.length === 0 ? <p className="text-cream-muted">No paid orders in this period.</p> : (
            <DataTable caption="Sales by server">
              <thead><tr><th scope="col">Server</th><th scope="col" className="text-right">Orders</th><th scope="col" className="text-right">Average</th><th scope="col" className="text-right">Tips</th><th scope="col" className="text-right">Sales</th></tr></thead>
              <tbody>
                {r.byServer.map((s) => (
                  <tr key={s.staffName}><td>{s.staffName}</td><td className="text-right tabular-nums">{s.orders}</td><td className="text-right tabular-nums">{formatCedis(s.averageOrder)}</td><td className="text-right tabular-nums">{formatCedis(s.tips)}</td><td className="text-right tabular-nums">{formatCedis(s.sales)}</td></tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Report>

        <Report id="by-method" title="Payment methods" note="Money taken in this period, part payments included." csv={csv("methods")}>
          {r.byMethod.length === 0 ? <p className="text-cream-muted">No payments in this period.</p> : (
            <DataTable caption="Payment methods">
              <thead><tr><th scope="col">Method</th><th scope="col" className="text-right">Payments</th><th scope="col" className="text-right">Amount</th></tr></thead>
              <tbody>
                {r.byMethod.map((m) => (
                  <tr key={`${m.method}:${m.network ?? ""}`}><td>{METHOD_LABELS[m.method]}{m.network ? ` · ${NETWORK_LABELS[m.network]}` : ""}</td><td className="text-right tabular-nums">{m.count}</td><td className="text-right tabular-nums">{formatCedis(m.amount)}</td></tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Report>

        <Report id="taxes" title="Taxes" note="Collected on orders paid in this period, as charged. For VAT, NHIL and GETFund returns." csv={csv("taxes")}>
          {r.taxes.length === 0 ? <p className="text-cream-muted">No taxes collected in this period.</p> : (
            <DataTable caption="Taxes">
              <thead><tr><th scope="col">Tax</th><th scope="col" className="text-right">Amount</th></tr></thead>
              <tbody>
                {r.taxes.map((t) => (<tr key={t.id}><td>{t.label}</td><td className="text-right tabular-nums">{formatCedis(t.amount)}</td></tr>))}
                <tr className="font-semibold"><td>Total</td><td className="text-right tabular-nums">{formatCedis(r.summary.taxes)}</td></tr>
              </tbody>
            </DataTable>
          )}
        </Report>

        <Report id="by-hour" title="Busiest hours" note="Paid orders by the hour they were opened." csv={csv("hours")}>
          <DataTable caption="Busiest hours">
            <thead><tr><th scope="col">Hour</th><th scope="col">Orders</th><th scope="col" className="text-right">Sales</th></tr></thead>
            <tbody>
              {r.byHour.filter((h) => h.orders > 0).map((h) => (
                <tr key={h.hour}>
                  <td className="tabular-nums">{hourName(h.hour)}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="h-2.5 rounded-full bg-amber" style={{ width: `${(h.orders / busiest) * 10}rem` }} />
                      <span className="tabular-nums">{h.orders}</span>
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatCedis(h.sales)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Report>
      </div>
    </div>
  );
}
