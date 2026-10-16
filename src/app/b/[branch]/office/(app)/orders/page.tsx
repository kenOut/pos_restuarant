import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, OfficeHeader, Pager, PeriodPicker, buttonLinkClass, selectClass, withQuery } from "@/components/office/parts";
import { ORDER_STATUSES, ORDER_TYPES } from "@/db/enums";
import { formatCedis } from "@/lib/money";
import { STATUS_LABELS, listOrders, listStaffForFilters, orderFiltersFrom, resolveRange } from "@/lib/office/reports";
import { requireOffice } from "@/lib/office/session";
import { ORDER_TYPE_LABELS } from "@/lib/orders/shared";
import { branchPath, getDb } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Orders" };

const time = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const person = await requireOffice();
  const db = await getDb();
  const q = await searchParams;
  const range = resolveRange(q.period, q.from, q.to);
  const filters = orderFiltersFrom(q, range);
  const page = Math.max(1, Number(q.page) || 1);
  const { rows, total, pages } = listOrders(db, person.restaurantId, filters, page);
  const path = await branchPath("/office/orders");
  const keep = { status: filters.status, type: filters.type, staff: filters.staffId, q: filters.search };
  const periodParams = { period: range.period, from: range.period === "custom" ? range.fromDay : null, to: range.period === "custom" ? range.toDay : null };

  return (
    <div>
      <OfficeHeader
        title="Orders"
        description={`${range.label} · ${total} order${total === 1 ? "" : "s"}`}
        actions={
          <a href={withQuery(await branchPath("/office/export/orders"), { ...keep, ...periodParams })} className={buttonLinkClass}>
            Download CSV
          </a>
        }
      />
      <div className="space-y-4 p-3 sm:p-4">
        <PeriodPicker path={path} range={range} keep={keep} />
        <form action={path} className="flex flex-wrap items-end gap-3">
          {Object.entries(periodParams).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <label className="text-sm text-cream-muted">
            Status
            <select name="status" defaultValue={filters.status ?? ""} className={selectClass}>
              <option value="">All</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-cream-muted">
            Type
            <select name="type" defaultValue={filters.type ?? ""} className={selectClass}>
              <option value="">All</option>
              {ORDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ORDER_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-cream-muted">
            Server
            <select name="staff" defaultValue={filters.staffId ?? ""} className={selectClass}>
              <option value="">Everyone</option>
              {listStaffForFilters(db, person.restaurantId).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-cream-muted">
            Order number, table or customer
            <input name="q" type="search" defaultValue={filters.search ?? ""} className={`${selectClass} w-56`} />
          </label>
          <button type="submit" className={buttonLinkClass}>
            Filter
          </button>
        </form>

        {rows.length === 0 ? (
          <p className="rounded-2xl border border-ink-700 bg-ink-850 p-6 text-center text-cream-muted">No orders match.</p>
        ) : (
          <DataTable caption="Orders">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Opened</th>
                <th scope="col">Type</th>
                <th scope="col">Server</th>
                <th scope="col" className="text-right">Items</th>
                <th scope="col" className="text-right">Total</th>
                <th scope="col" className="text-right">Paid</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`${path}/${o.id}`} className="inline-flex min-h-11 min-w-11 items-center font-semibold text-amber underline-offset-4 hover:underline">
                      #{o.number}
                    </Link>
                  </td>
                  <td className="tabular-nums">{time.format(o.openedAt)}</td>
                  <td>
                    {ORDER_TYPE_LABELS[o.type]}
                    {o.tableLabel ? ` · ${o.tableLabel}` : o.customerName ? ` · ${o.customerName}` : ""}
                  </td>
                  <td>{o.staffName}</td>
                  <td className="text-right tabular-nums">{o.itemCount}</td>
                  <td className="text-right tabular-nums">{formatCedis(o.total)}</td>
                  <td className="text-right tabular-nums">{formatCedis(o.paid)}</td>
                  <td>{STATUS_LABELS[o.status]}</td>
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
