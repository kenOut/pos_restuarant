import { Icon, type IconName } from "@/components/icons";
import { DEMO_MENU, menuItem } from "@/data/demo-menu";
import { formatAmount, formatCedis } from "@/lib/money";
import { calculateBill } from "@/lib/tax";
import { RestaurantMark } from "@/components/brand/restaurant-mark";

// The deck's phone order #1927: 1× Kelewele, 2× Chicken wings → GH₵ 174.01.
const PHONE_TICKET = [
  { id: "kelewele", quantity: 1 },
  { id: "chicken-wings", quantity: 2 },
];

const TABS: { icon: IconName; label: string; badge?: number }[] = [
  { icon: "home", label: "Home" },
  { icon: "tables", label: "Tables" },
  { icon: "order", label: "Order" },
  { icon: "kitchen", label: "Kitchen", badge: 4 },
  { icon: "menu", label: "More" },
];

export function PhoneOrderScreen() {
  const bill = calculateBill(PHONE_TICKET.map((l) => ({ unitPrice: menuItem(l.id).price, quantity: l.quantity })));
  const qty = new Map(PHONE_TICKET.map((l) => [l.id, l.quantity]));
  const count = PHONE_TICKET.reduce((n, l) => n + l.quantity, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pt-8 pb-2">
        <span className="font-display text-base font-bold whitespace-nowrap">Order #1927</span>
        <span className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-ink-700 bg-ink-850 px-2 py-1 text-2xs text-cream-faint">
          <Icon name="search" className="size-2.5 shrink-0" />
          <span className="truncate">Search dishes or drinks</span>
        </span>
      </div>
      <div className="flex gap-1 overflow-hidden px-3 pb-2 text-2xs">
        {["All", "Starters", "Mains", "Grills", "Drinks"].map((c) => (
          <span
            key={c}
            className={`shrink-0 rounded-full px-2.5 py-1 ${c === "All" ? "bg-amber text-amber-ink" : "border border-ink-700"}`}
          >
            {c}
          </span>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-1.5 overflow-hidden px-3">
        {DEMO_MENU.slice(0, 12).map((item) => {
          const q = qty.get(item.id);
          return (
            <div
              key={item.id}
              className={`relative flex h-12 flex-col justify-between rounded-md border p-1.5 ${
                q ? "border-amber/80 bg-amber-soft" : "border-ink-700 bg-ink-850"
              }`}
            >
              <span className="text-2xs leading-tight">{item.name}</span>
              <span className="flex justify-between text-[0.5em]">
                <span className="font-semibold">GH₵ {formatAmount(item.price)}</span>
                <span className="text-cream-faint">{item.station}</span>
              </span>
              {q ? (
                <span className="absolute -top-1 -right-1 grid size-3 place-items-center rounded-full bg-amber text-[0.5em] font-bold text-amber-ink">
                  {q}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-3 bottom-12 flex justify-between rounded-lg bg-amber px-3 py-2 text-xs font-semibold text-amber-ink shadow-lg">
        <span>View order · {count} items</span>
        <span>{formatCedis(bill.total)}</span>
      </div>
      <div className="grid grid-cols-5 border-t border-ink-700 bg-ink-950 px-2 pt-1.5 pb-4">
        {TABS.map((t) => (
          <span
            key={t.label}
            className={`relative flex flex-col items-center gap-0.5 text-[0.5em] ${t.label === "Order" ? "text-amber" : "text-cream-muted"}`}
          >
            <Icon name={t.icon} className="size-[1.9em]" />
            {t.label}
            {t.badge ? (
              <span className="absolute -top-0.5 right-[22%] grid size-[1.4em] place-items-center rounded-full bg-alert text-[0.85em] font-bold text-white">
                {t.badge}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

const STAFF = [
  { initials: "KB", name: "Kwame B.", role: "Manager · on shift", selected: true },
  { initials: "KA", name: "Kofi A.", role: "Server" },
  { initials: "EM", name: "Efua M.", role: "Cashier" },
  { initials: "AO", name: "Abena O.", role: "Bartender" },
  { initials: "YD", name: "Yaw D.", role: "Grill cook · on shift" },
  { initials: "AT", name: "Akosua T.", role: "Line cook · on shift" },
  { initials: "AO", name: "Ama Owner", role: "Owner" },
];

export function PhoneSignInScreen() {
  return (
    <div className="flex h-full flex-col px-3 pt-8 pb-4">
      <div className="flex items-center gap-2">
        <RestaurantMark className="size-7" />
        <div className="flex-1 leading-tight">
          <div className="text-xs font-semibold">Chez Accra</div>
          <div className="text-[0.5em] text-cream-faint">Terminal 1</div>
        </div>
        <div className="text-right leading-tight">
          <div className="font-display text-lg font-bold">15:10</div>
          <div className="text-[0.5em] text-cream-faint">Sunday 4 October</div>
        </div>
      </div>
      <div className="mt-4 text-base font-bold">Who&rsquo;s signing in?</div>
      <div className="text-2xs text-cream-faint">Tap your name, then enter your 4-digit PIN.</div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {STAFF.map((s) => (
          <div
            key={s.name}
            className={`flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-center ${
              s.selected ? "border-amber bg-amber-soft" : "border-ink-700 bg-ink-850"
            }`}
          >
            <span className="grid size-6 place-items-center rounded-full bg-ink-600">
              <span className="text-[0.5em] font-bold text-amber">{s.initials}</span>
            </span>
            <span className="text-[0.55em] font-semibold">{s.name}</span>
            <span className="text-[0.42em] text-cream-faint">{s.role}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-center text-2xs text-cream-faint">PIN for Kwame B.</div>
      <div className="mt-1.5 flex justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="size-2 rounded-full border border-cream-muted" />
        ))}
      </div>
      <div className="mt-auto grid grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "Back"].map((k) => (
          <span key={k} className="grid h-9 place-items-center rounded-md bg-ink-800">
            <span className={k.length > 1 ? "text-2xs text-cream-muted" : "text-sm font-semibold"}>{k}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
