import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, OfficeHeader, buttonLinkClass } from "@/components/office/parts";
import { formatCedis } from "@/lib/money";
import { STATUS_LABELS } from "@/lib/office/reports";
import { requireOffice } from "@/lib/office/session";
import { ORDER_TYPE_LABELS, formatOrderNumber } from "@/lib/orders/shared";
import { taxLinesForDisplay } from "@/lib/payments/bill";
import { describePayment } from "@/lib/payments/labels";
import { getPaymentView } from "@/lib/payments/service";
import { branchPath, getDb } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Order" };

const time = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const person = await requireOffice();
  const view = getPaymentView(await getDb(), person.restaurantId, (await params).id);
  if (!view) notFound();
  const { order, bill } = view;
  const row = "flex justify-between gap-4 py-1";

  return (
    <div>
      <OfficeHeader
        title={`Order #${formatOrderNumber(order.number)}`}
        description={`${STATUS_LABELS[order.status]} · ${ORDER_TYPE_LABELS[order.type]}${order.tableLabel ? ` · Table ${order.tableLabel}` : ""}${order.customerName ? ` · ${order.customerName}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={await branchPath("/office/orders")} className={buttonLinkClass}>
              All orders
            </Link>
            <Link href={await branchPath(`/office/receipt/${order.id}`)} className={buttonLinkClass}>
              {order.status === "paid" ? "Receipt" : "Bill"}
            </Link>
          </div>
        }
      />
      <div className="grid gap-6 p-3 sm:p-4 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="lines" className="space-y-3">
          <h2 id="lines" className="font-display text-xl font-semibold">
            Items
          </h2>
          <DataTable caption="Items on this order">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="text-right">Qty</th>
                <th scope="col" className="text-right">Price</th>
                <th scope="col" className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.name}
                    {l.note ? <span className="block text-xs text-amber/80">{l.note}</span> : null}
                  </td>
                  <td className="text-right tabular-nums">{l.quantity}</td>
                  <td className="text-right tabular-nums">{formatCedis(l.unitPrice)}</td>
                  <td className="text-right tabular-nums">{formatCedis(l.unitPrice * l.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>

          <h2 className="pt-3 font-display text-xl font-semibold">Payments</h2>
          {view.payments.length === 0 ? (
            <p className="text-cream-muted">No payments yet.</p>
          ) : (
            <DataTable caption="Payments on this order">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Method</th>
                  <th scope="col">Taken by</th>
                  <th scope="col" className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {view.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="tabular-nums">{time.format(p.createdAt)}</td>
                    <td>
                      {describePayment(p)}
                      {p.method === "cash" && p.tendered ? <span className="block text-xs text-cream-muted">Received {formatCedis(p.tendered)} · change {formatCedis(p.change ?? 0)}</span> : null}
                    </td>
                    <td>{p.staffName}</td>
                    <td className="text-right tabular-nums">{formatCedis(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </section>

        <aside aria-labelledby="bill" className="h-fit rounded-2xl border border-ink-700 bg-ink-850 p-4 text-sm">
          <h2 id="bill" className="font-display text-xl font-semibold">
            Bill
          </h2>
          <dl className="mt-2 divide-y divide-ink-700">
            <div className={row}><dt>Server</dt><dd>{order.staffName}</dd></div>
            <div className={row}><dt>Opened</dt><dd className="tabular-nums">{time.format(order.createdAt)}</dd></div>
            {order.paidAt ? <div className={row}><dt>Paid</dt><dd className="tabular-nums">{time.format(order.paidAt)}</dd></div> : null}
            <div className={row}><dt>Subtotal</dt><dd className="tabular-nums">{formatCedis(bill.subtotal)}</dd></div>
            {bill.discount ? (
              <div className={row}><dt>Discount{order.discountReason ? ` (${order.discountReason})` : ""}</dt><dd className="tabular-nums">−{formatCedis(bill.discount)}</dd></div>
            ) : null}
            {taxLinesForDisplay(bill.taxes).map((t) => (
              <div key={t.label} className={row}><dt>{t.label}{bill.pricesIncludeTax ? " (included)" : ""}</dt><dd className="tabular-nums">{formatCedis(t.amount)}</dd></div>
            ))}
            {bill.tip ? <div className={row}><dt>Tip</dt><dd className="tabular-nums">{formatCedis(bill.tip)}</dd></div> : null}
            <div className={`${row} text-base font-bold`}><dt>Total</dt><dd className="tabular-nums">{formatCedis(bill.total)}</dd></div>
            <div className={row}><dt>Paid</dt><dd className="tabular-nums">{formatCedis(view.paid)}</dd></div>
            {view.balance ? <div className={`${row} font-semibold text-alert`}><dt>Still to pay</dt><dd className="tabular-nums">{formatCedis(view.balance)}</dd></div> : null}
          </dl>
        </aside>
      </div>
    </div>
  );
}
