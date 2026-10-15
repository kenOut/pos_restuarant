import { describePayment } from "@/lib/payments/labels";
import type { PaymentView } from "@/lib/payments/service";
import { formatAmount, formatCedis } from "@/lib/money";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

/** The bill as the guest will see it, plus what has been paid so far. */
export function BillPanel({ view, className = "" }: { view: PaymentView; className?: string }) {
  const { bill } = view;
  const row = "flex justify-between gap-3";

  return (
    <section aria-labelledby="bill-title" className={`flex flex-col rounded-2xl border border-ink-700 bg-ink-850 ${className}`}>
      <h2 id="bill-title" className="border-b border-ink-700 px-4 py-3 font-semibold">
        Bill
      </h2>
      <div className="px-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <ul className="divide-y divide-ink-700">
          {view.lines.map((l) => (
            <li key={l.id} className="py-2.5">
              <div className={row}>
                <span>
                  {l.quantity}× {l.name}
                </span>
                <span className="tabular-nums">{formatAmount(l.unitPrice * l.quantity)}</span>
              </div>
              {l.note ? <p className="text-sm text-amber">{l.note}</p> : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-ink-700 px-4 py-3">
        <dl className="space-y-0.5 text-sm text-cream-muted">
          <div className={row}>
            <dt>Subtotal</dt>
            <dd className="whitespace-nowrap tabular-nums">{formatCedis(bill.subtotal)}</dd>
          </div>
          {bill.discount ? (
            <div className={`${row} text-eating`}>
              <dt>
                Discount{view.order.discountReason ? ` · ${view.order.discountReason}` : ""}
                {view.order.discountApprovedBy ? <span className="block text-xs text-cream-faint">Approved by {view.order.discountApprovedBy}</span> : null}
              </dt>
              <dd className="whitespace-nowrap tabular-nums">−{formatCedis(bill.discount)}</dd>
            </div>
          ) : null}
          {bill.taxes.map((t) => (
            <div key={t.id} className={row}>
              <dt>{t.label}</dt>
              <dd className="whitespace-nowrap tabular-nums">{formatCedis(t.amount)}</dd>
            </div>
          ))}
          {bill.tip ? (
            <div className={row}>
              <dt>Tip</dt>
              <dd className="whitespace-nowrap tabular-nums">{formatCedis(bill.tip)}</dd>
            </div>
          ) : null}
          <div className={`${row} pt-1.5 text-lg font-bold text-cream`}>
            <dt>Total</dt>
            <dd className="whitespace-nowrap tabular-nums">{formatCedis(bill.total)}</dd>
          </div>
        </dl>

        {view.payments.length ? (
          <>
            <h3 className="mt-3 text-sm font-semibold text-cream-muted">Payments</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {view.payments.map((p) => (
                <li key={p.id} className={row}>
                  <span className="min-w-0">
                    {describePayment(p)}
                    <span className="block text-xs text-cream-faint">
                      {timeFormat.format(p.createdAt)} · {p.staffName}
                      {p.method === "cash" && p.change ? ` · received ${formatCedis(p.tendered ?? 0)}, change ${formatCedis(p.change)}` : ""}
                    </span>
                  </span>
                  <span className="whitespace-nowrap tabular-nums">{formatCedis(p.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div className={`${row} mt-3 border-t border-ink-700 pt-3`}>
          <span className="font-semibold">{view.order.status === "paid" ? "Paid in full" : view.payments.length ? "Still to pay" : "Total due"}</span>
          <span className="font-display text-2xl font-bold tabular-nums">{formatCedis(view.order.status === "paid" ? bill.total : view.balance)}</span>
        </div>
      </div>
    </section>
  );
}
