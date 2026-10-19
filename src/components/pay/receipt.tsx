import { describePayment } from "@/lib/payments/labels";
import { taxLinesForDisplay } from "@/lib/payments/bill";
import type { PaymentView } from "@/lib/payments/service";
import { ORDER_TYPE_LABELS, formatOrderNumber } from "@/lib/orders/shared";
import { formatAmount, formatCedis } from "@/lib/money";

// Ghana is on GMT all year; fixed so the receipt reads the same whatever the server's clock zone.
const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

/** The 80 mm receipt (or bill, before payment), as printed. Used by the till and the back office. */
export function Receipt({ view, logoSrc }: { view: PaymentView; logoSrc: string | null }) {
  const { order, bill } = view;
  const paid = order.status === "paid";
  const row = "flex justify-between gap-4";
  const rule = <div className="my-2 border-t border-dashed border-black/50" />;
  return (
    <article
      aria-label={paid ? "Receipt" : "Bill"}
      className="mx-auto mt-4 w-[80mm] max-w-full bg-white px-4 py-5 font-mono text-[12px] leading-snug text-black shadow-xl print:mt-0 print:w-full print:shadow-none"
    >
      <header className="text-center">
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- printed receipt logo from our own route
          <img src={logoSrc!} alt="" className="mx-auto mb-1 h-14 w-auto object-contain grayscale" />
        ) : null}
        <p className="text-[15px] font-bold">{view.restaurantName}</p>
        <p className="mt-1 font-bold">{paid ? "RECEIPT" : "BILL"}</p>
        <p>
          Order #{formatOrderNumber(order.number)} · {ORDER_TYPE_LABELS[order.type]}
          {order.tableLabel ? ` · Table ${order.tableLabel}` : ""}
        </p>
        {order.customerName ? <p>{order.customerName}</p> : null}
        <p>{paid && order.paidAt ? `Paid ${dateTime.format(order.paidAt)}` : `Opened ${dateTime.format(order.createdAt)}`}</p>
        <p>Served by {order.staffName}</p>
      </header>
      {rule}
      {view.lines.map((l) => (
        <div key={l.id}>
          <p className={row}>
            <span>
              {l.quantity}× {l.name}
            </span>
            <span>{formatAmount(l.unitPrice * l.quantity)}</span>
          </p>
          {l.note ? <p className="pl-4 text-[11px]">{l.note}</p> : null}
        </div>
      ))}
      {rule}
      <p className={row}>
        <span>Subtotal</span>
        <span>{formatAmount(bill.subtotal)}</span>
      </p>
      {bill.discount ? (
        <p className={row}>
          <span>Discount{order.discountReason ? ` (${order.discountReason})` : ""}</span>
          <span>-{formatAmount(bill.discount)}</span>
        </p>
      ) : null}
      {bill.pricesIncludeTax && bill.taxes.length ? <p>Prices include:</p> : null}
      {taxLinesForDisplay(bill.taxes).map((t) => (
        <p key={t.label} className={`${row} ${bill.pricesIncludeTax ? "pl-4" : ""}`}>
          <span>{t.label}</span>
          <span>{formatAmount(t.amount)}</span>
        </p>
      ))}
      {bill.tip ? (
        <p className={row}>
          <span>Tip</span>
          <span>{formatAmount(bill.tip)}</span>
        </p>
      ) : null}
      <p className={`${row} mt-1 text-[14px] font-bold`}>
        <span>TOTAL</span>
        <span>{formatCedis(bill.total)}</span>
      </p>
      {view.payments.length ? (
        <>
          {rule}
          {view.payments.map((p) => (
            <div key={p.id}>
              <p className={row}>
                <span>{describePayment(p)}</span>
                <span>{formatAmount(p.amount)}</span>
              </p>
              {p.method === "cash" && p.tendered ? (
                <p className="pl-4 text-[11px]">
                  Received {formatAmount(p.tendered)} · Change {formatAmount(p.change ?? 0)}
                </p>
              ) : null}
            </div>
          ))}
          {!paid ? (
            <p className={`${row} font-bold`}>
              <span>Still to pay</span>
              <span>{formatCedis(view.balance)}</span>
            </p>
          ) : null}
        </>
      ) : null}
      {rule}
      {view.receiptFooter ? <p className="text-center">{view.receiptFooter}</p> : null}
    </article>
  );
}
