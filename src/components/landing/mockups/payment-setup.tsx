import { Icon, type IconName } from "@/components/icons";
import { menuItem } from "@/data/demo-menu";
import { formatAmount, formatCedis } from "@/lib/money";
import { calculateBill } from "@/lib/tax";
import { TillSidebar } from "./device";

const BILL = [
  { id: "jollof-chicken", quantity: 2 },
  { id: "banku-tilapia", quantity: 1 },
  { id: "sobolo", quantity: 2 },
];

const METHODS: { icon: IconName; name: string; hint: string; selected?: boolean }[] = [
  { icon: "cash", name: "Cash", hint: "Notes and coins" },
  { icon: "card", name: "Card", hint: "On the card terminal" },
  { icon: "phone", name: "Mobile money", hint: "MoMo, Telecel Cash, AT Money", selected: true },
  { icon: "voucher", name: "Voucher", hint: "Gift card or promo" },
  { icon: "user", name: "House account", hint: "Pay later on account" },
];

export function PaymentScreen() {
  const lines = BILL.map((l) => ({ ...l, item: menuItem(l.id) }));
  const bill = calculateBill(lines.map((l) => ({ unitPrice: l.item.price, quantity: l.quantity })));

  return (
    <div className="flex h-full">
      <TillSidebar active="Order" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-ink-700">
            <Icon name="back" className="size-3" />
          </span>
          <span className="font-display text-xl font-bold">Payment · Takeaway</span>
          <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[0.5em]">Order #1926</span>
          <span className="ml-auto text-[0.5em] text-cream-faint">Taking payment: Kwame B.</span>
        </div>
        <div className="flex min-h-0 flex-1 gap-2">
          {/* Bill */}
          {/* Text sizes sit on the rows, not this panel: inside a mockup, spacing scales with the element's own font size. */}
          <div className="flex w-56 shrink-0 flex-col rounded-xl border border-ink-700 bg-ink-850 p-3">
            <span className="text-sm font-bold">Bill</span>
            <div className="mt-1.5 flex flex-col divide-y divide-ink-700 text-2xs">
              {lines.map((l) => (
                <span key={l.id} className="flex justify-between py-1.5">
                  <span>
                    {l.quantity}× {l.item.name}
                  </span>
                  <span>{formatAmount(l.item.price * l.quantity)}</span>
                </span>
              ))}
            </div>
            <div className="mt-auto flex flex-col gap-0.5 text-2xs text-cream-muted">
              <span className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCedis(bill.subtotal)}</span>
              </span>
              {bill.taxes.map((t) => (
                <span key={t.id} className="flex justify-between">
                  <span>{t.label}</span>
                  <span>{formatCedis(t.amount)}</span>
                </span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-4 rounded-md bg-ink-950 p-0.5 text-center text-[0.5em]">
              {["None", "5%", "10%", "15%"].map((t) => (
                <span key={t} className={`rounded-sm py-1 ${t === "None" ? "bg-ink-700" : "text-cream-muted"}`}>
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-end justify-between border-t border-ink-700 pt-2">
              <span className="text-2xs">Total due</span>
              <span className="font-display text-xl font-bold">{formatCedis(bill.total)}</span>
            </div>
          </div>

          {/* Methods + amount */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="grid grid-cols-5 gap-1.5">
              {METHODS.map((m) => (
                <div
                  key={m.name}
                  className={`flex flex-col gap-0.5 rounded-lg border p-2 ${m.selected ? "border-amber bg-amber-soft" : "border-ink-700 bg-ink-850"}`}
                >
                  <Icon name={m.icon} className="size-3" />
                  <span className="text-2xs font-semibold leading-tight">{m.name}</span>
                  <span className="text-[0.45em] leading-tight text-cream-faint">{m.hint}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 rounded-xl border border-ink-700 bg-ink-850 p-3">
              <div className="flex flex-1 flex-col gap-1.5 text-[0.5em]">
                <span className="text-cream-faint">Amount to collect</span>
                <span className="flex gap-1">
                  {["Full", "1/2", "1/3", "1/4"].map((s) => (
                    <span key={s} className="rounded-full border border-ink-600 px-2 py-0.5">
                      {s}
                    </span>
                  ))}
                </span>
                <span className="rounded-md border border-amber px-2 py-1.5 font-display text-[2.2em] font-bold">
                  {formatCedis(bill.total)}
                </span>
                <span className="grid grid-cols-3 rounded-md bg-ink-950 p-0.5 text-center">
                  {["MTN MoMo", "Telecel Cash", "AT Money"].map((n) => (
                    <span key={n} className={`rounded-sm py-1 ${n === "MTN MoMo" ? "bg-ink-700" : "text-cream-muted"}`}>
                      {n}
                    </span>
                  ))}
                </span>
                <span className="text-cream-faint">Customer&rsquo;s number</span>
                <span className="rounded-md border border-amber/60 px-2 py-1.5">024 000 5821</span>
                <span className="text-amber">Record the payment once the customer has approved it.</span>
                <span className="mt-2 rounded-md bg-amber py-2 text-center font-semibold text-amber-ink">
                  Take {formatCedis(bill.total)} and close
                </span>
              </div>
              <div className="grid w-32 shrink-0 grid-cols-3 content-start gap-1.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "Back"].map((k) => (
                  <span
                    key={k}
                    className={`rounded-md border border-ink-700 bg-ink-800 py-2 text-center ${k === "Back" ? "text-[0.5em]" : "text-sm"}`}
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SETUP_OPTIONS = [
  {
    kicker: "Start here",
    title: "Main computer for this restaurant",
    body: "Keeps the restaurant's data. Tills, tablets and the kitchen screen connect to it.",
  },
  {
    kicker: "Extra devices",
    title: "Till or extra screen",
    body: "Connects to the restaurant's main computer. Use this for every other till.",
  },
  {
    kicker: "Several branches",
    title: "Head office",
    body: "Collects sales from all your branches and sends out the master menu.",
  },
];

export function SetupScreen() {
  return (
    <div className="grid h-full place-items-center bg-ink-950 p-8">
      <div className="w-full max-w-[40em]">
        <span className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-amber font-display text-lg font-extrabold text-amber-ink">
            E
          </span>
          <span className="font-display text-sm font-bold tracking-wide">ENYO POS</span>
        </span>
        <div className="mt-6 text-xl font-bold">How will this computer be used?</div>
        <div className="text-2xs text-cream-faint">You can change this later with Ctrl+Shift+S.</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {SETUP_OPTIONS.map((o, i) => (
            <div
              key={o.title}
              className={`rounded-lg border p-3 ${i === 0 ? "border-amber/70 bg-amber-soft" : "border-ink-700 bg-ink-850"}`}
            >
              <div className="text-[0.5em] font-bold tracking-wider text-amber uppercase">{o.kicker}</div>
              <div className="mt-1 text-xs font-bold leading-tight">{o.title}</div>
              <div className="mt-1 text-[0.5em] text-cream-muted">{o.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
