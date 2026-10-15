import { Icon } from "@/components/icons";
import { CATEGORIES, DEMO_MENU, menuItem } from "@/data/demo-menu";
import { formatAmount, formatCedis } from "@/lib/money";
import { calculateBill } from "@/lib/tax";
import { TillSidebar } from "./device";

// The deck's order #1926: 2× Jollof, 1× Banku and tilapia, 2× Sobolo (takeaway).
const TICKET = [
  { id: "jollof-chicken", quantity: 2 },
  { id: "banku-tilapia", quantity: 1 },
  { id: "sobolo", quantity: 2 },
];

export function OrderScreen() {
  const lines = TICKET.map((line) => ({ ...line, item: menuItem(line.id) }));
  const bill = calculateBill(lines.map((l) => ({ unitPrice: l.item.price, quantity: l.quantity })));
  const inTicket = new Map(lines.map((l) => [l.id, l.quantity]));
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <div className="flex h-full">
      <TillSidebar active="Order" />

      {/* Menu */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-xl font-bold">Order #1926</span>
          <span className="flex flex-1 items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 text-xs text-cream-faint">
            <Icon name="search" className="size-3" />
            Search dishes or drinks
          </span>
        </div>
        <div className="flex min-h-0 flex-1 gap-2.5">
          <div className="flex w-20 shrink-0 flex-col gap-1.5">
            {["All", ...CATEGORIES].map((c) => (
              <span
                key={c}
                className={`rounded-md border px-2 py-2 text-xs ${
                  c === "All" ? "border-amber/70 bg-amber-soft" : "border-ink-700 bg-ink-850"
                }`}
              >
                {c}
              </span>
            ))}
          </div>
          <div className="grid flex-1 auto-rows-min grid-cols-3 gap-1.5">
            {DEMO_MENU.map((item) => {
              const qty = inTicket.get(item.id);
              return (
                <div
                  key={item.id}
                  className={`relative flex h-14 flex-col justify-between rounded-md border p-2 ${
                    qty ? "border-amber/80 bg-amber-soft" : "border-ink-700 bg-ink-850"
                  }`}
                >
                  <span className="text-xs leading-tight">{item.name}</span>
                  <span className="flex items-baseline justify-between text-2xs">
                    <span className="font-semibold">GH₵ {formatAmount(item.price)}</span>
                    <span className="text-cream-faint">{item.station}</span>
                  </span>
                  {qty ? (
                    <span className="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full bg-amber text-2xs font-bold text-amber-ink">
                      {qty}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ticket */}
      <div className="m-2 ml-0 flex w-60 shrink-0 flex-col rounded-xl border border-ink-700 bg-ink-850 p-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-bold">Takeaway</div>
            <div className="text-2xs text-cream-faint">Kwame B. · No guest attached</div>
          </div>
          <div className="flex gap-1">
            {(["user", "tables"] as const).map((icon) => (
              <span key={icon} className="grid size-6 place-items-center rounded-md border border-ink-600">
                <Icon name={icon} className="size-3" />
              </span>
            ))}
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-3 rounded-md bg-ink-950 p-0.5 text-center text-2xs">
          {["Dine-in", "Takeaway", "Delivery"].map((t) => (
            <span key={t} className={`rounded-sm py-1.5 ${t === "Takeaway" ? "bg-ink-700 text-cream" : "text-cream-muted"}`}>
              {t}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-col divide-y divide-ink-700">
          {lines.map((line) => (
            <div key={line.id} className="py-2">
              <div className="flex justify-between text-xs">
                <span>{line.item.name}</span>
                <span>GH₵ {formatAmount(line.item.price * line.quantity)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs">
                  <span className="grid size-5 place-items-center rounded-md bg-ink-700">
                    <Icon name="minus" className="size-2.5" />
                  </span>
                  {line.quantity}
                  <span className="grid size-5 place-items-center rounded-md bg-ink-700">
                    <Icon name="plus" className="size-2.5" />
                  </span>
                </span>
                <span className="flex items-center gap-1 rounded-md bg-ink-700 px-2 py-1 text-2xs">
                  <Icon name="note" className="size-2.5" />
                  Note
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-0.5 text-2xs text-cream-muted">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCedis(bill.subtotal)}</span>
          </div>
          {bill.taxes.map((t) => (
            <div key={t.id} className="flex justify-between">
              <span>{t.label}</span>
              <span>{formatCedis(t.amount)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between text-base font-bold text-cream">
            <span>Total</span>
            <span>{formatCedis(bill.total)}</span>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-2xs">
          <span className="rounded-md bg-ink-700 py-2 text-center">Hold</span>
          <span className="rounded-md bg-ink-700 py-2 text-center">Send to kitchen ({itemCount})</span>
        </div>
        <span className="mt-1.5 rounded-md bg-amber py-2.5 text-center text-xs font-semibold text-amber-ink">
          Pay {formatCedis(bill.total)}
        </span>
      </div>
    </div>
  );
}
