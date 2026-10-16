import { Icon } from "@/components/icons";
import { TillSidebar } from "./device";

type TableState = "free" | "eating" | "reserved" | "waiting";

const TABLE_STYLES: Record<TableState, string> = {
  free: "border-dashed border-cream-faint/60 text-cream-muted",
  eating: "border-eating bg-eating-soft text-cream",
  reserved: "border-reserved bg-reserved-soft text-cream",
  waiting: "border-alert bg-alert-soft text-cream",
};

const TABLES: { id: string; info: string; state: TableState; round?: boolean; selected?: boolean }[] = [
  { id: "T1", info: "4 seats", state: "free", round: true },
  { id: "T2", info: "2 seats", state: "free", round: true },
  { id: "T3", info: "4 · 19m", state: "eating", round: true },
  { id: "T4", info: "16:00", state: "reserved", round: true },
  { id: "B1", info: "6 seats", state: "free" },
  { id: "T5", info: "4 · 44m", state: "waiting" },
  { id: "T6", info: "6 seats", state: "free" },
  { id: "T7", info: "4 · 13m", state: "eating", selected: true },
  { id: "T8", info: "2 seats", state: "free", round: true },
  { id: "B2", info: "6 seats", state: "free" },
  { id: "T9", info: "4 seats", state: "free", round: true },
  { id: "T10", info: "4 seats", state: "free", round: true },
  { id: "T11", info: "2 seats", state: "free", round: true },
  { id: "B3", info: "15:45", state: "reserved" },
];

const LEGEND = [
  { label: "Free 9", dot: "bg-cream-faint" },
  { label: "Eating 2", dot: "bg-eating" },
  { label: "Ordering 0", dot: "bg-amber" },
  { label: "Waiting to pay 1", dot: "bg-alert" },
  { label: "Reserved 2", dot: "bg-reserved" },
];

export function FloorPlanScreen() {
  return (
    <div className="flex h-full">
      <TillSidebar active="Tables" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-xl font-bold">Floor plan</span>
          {["Main hall", "Terrace", "Bar"].map((a) => (
            <span
              key={a}
              className={`rounded-full px-2.5 py-1 text-2xs ${a === "Main hall" ? "bg-amber text-amber-ink" : "border border-ink-600"}`}
            >
              {a}
            </span>
          ))}
          <span className="ml-auto flex gap-1.5 text-2xs">
            <span className="flex items-center gap-1 rounded-md bg-ink-700 px-2 py-1.5">
              <Icon name="move" className="size-2.5" />
              Arrange
            </span>
            <span className="rounded-md bg-ink-700 px-2 py-1.5">Reservations</span>
            <span className="rounded-md bg-amber px-2 py-1.5 font-semibold text-amber-ink">Takeaway order</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[0.5em]">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1 rounded-full border border-ink-700 px-2 py-0.5">
              <span className={`size-1.5 rounded-full ${l.dot}`} />
              {l.label}
            </span>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 gap-2">
          <div className="grid flex-1 grid-cols-5 place-items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4">
            {TABLES.map((t) => (
              <span
                key={t.id}
                className={`grid size-14 place-content-center border text-center leading-tight ${
                  t.round ? "rounded-full" : "rounded-lg"
                } ${TABLE_STYLES[t.state]} ${t.selected ? "ring-2 ring-cream ring-offset-2 ring-offset-ink-850" : ""}`}
              >
                <span className="text-xs font-bold">{t.id}</span>
                <span className="text-[0.5em] opacity-80">{t.info}</span>
              </span>
            ))}
          </div>
          <div className="flex w-48 shrink-0 flex-col rounded-xl border border-ink-700 bg-ink-850 p-3">
            <div className="flex items-center justify-between">
              <span className="text-base font-bold">Table T7</span>
              <span className="rounded-full bg-eating-soft px-2 py-0.5 text-[0.5em] text-eating-text">Eating</span>
            </div>
            <span className="text-[0.5em] text-cream-faint">4 guests · Kofi A. · seated 13 min</span>
            <div className="mt-2 flex flex-col divide-y divide-ink-700 text-2xs">
              {[
                ["2× Jollof rice with chicken", "180.00"],
                ["1× Banku and tilapia", "120.00"],
                ["2× Sobolo", "40.00"],
              ].map(([name, amount]) => (
                <span key={name} className="flex justify-between py-1.5">
                  <span>{name}</span>
                  <span>{amount}</span>
                </span>
              ))}
              <span className="flex justify-between py-1.5 font-bold">
                <span>Total</span>
                <span>GH₵ 340.00</span>
              </span>
            </div>
            <div className="mt-auto grid grid-cols-2 gap-1.5">
              {["Add items", "Print bill", "Move table", "Change server"].map((b) => (
                <span key={b} className="rounded-md bg-ink-700 py-1.5 text-center text-2xs">
                  {b}
                </span>
              ))}
              <span className="col-span-2 rounded-md bg-amber py-2 text-center text-2xs font-semibold text-amber-ink">
                Take payment
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Ticket = {
  number: string;
  timer: string;
  minutes: number;
  meta: string;
  items: { qty: number; name: string; note?: string }[];
  cooking?: boolean;
};

const TICKETS: Ticket[] = [
  {
    number: "#1921",
    timer: "12:18",
    minutes: 12,
    meta: "Table T7 · Dine-in · Kofi A.",
    cooking: true,
    items: [
      { qty: 2, name: "Jollof rice with chicken", note: "1 without pepper" },
      { qty: 1, name: "Banku and tilapia", note: "Extra pepper, well done" },
      { qty: 2, name: "Sobolo" },
    ],
  },
  {
    number: "#1923",
    timer: "04:18",
    minutes: 4,
    meta: "Delivery",
    items: [
      { qty: 1, name: "Waakye special", note: "Add egg" },
      { qty: 1, name: "Kelewele", note: "Pack sauce separately" },
    ],
  },
  {
    number: "#1925",
    timer: "01:18",
    minutes: 1,
    meta: "Takeaway · Efua M.",
    items: [{ qty: 2, name: "Chicken wings", note: "Honey pepper glaze" }],
  },
  {
    number: "#1926",
    timer: "00:02",
    minutes: 0,
    meta: "Takeaway · Kwame B.",
    items: [
      { qty: 2, name: "Jollof rice with chicken" },
      { qty: 1, name: "Banku and tilapia" },
      { qty: 2, name: "Sobolo" },
    ],
  },
];

/** Timer colours from the deck: amber from 10 minutes, red from 15. */
function ticketHeader(minutes: number) {
  if (minutes >= 15) return "bg-late/40";
  if (minutes >= 10) return "bg-amber-soft text-amber";
  return "bg-eating-soft";
}

export function KitchenScreen() {
  return (
    <div className="flex h-full">
      <TillSidebar active="Kitchen" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-xl font-bold">Kitchen display</span>
          {["All stations", "Fryer", "Grill", "Kitchen", "Bar"].map((s) => (
            <span
              key={s}
              className={`rounded-full px-2.5 py-1 text-2xs ${s === "All stations" ? "bg-amber text-amber-ink" : "border border-ink-600"}`}
            >
              {s}
            </span>
          ))}
          <span className="ml-auto text-[0.5em] text-cream-faint">4 open · average 4 min</span>
          <span className="rounded-md bg-ink-700 px-2 py-1.5 text-2xs">Recall last</span>
        </div>
        <div className="grid flex-1 grid-cols-4 items-start gap-2">
          {TICKETS.map((t) => (
            <div key={t.number} className="flex flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-850">
              <div className={`px-2.5 py-2 ${ticketHeader(t.minutes)}`}>
                <div className="flex justify-between font-display text-sm font-bold">
                  <span>{t.number}</span>
                  <span className="tabular-nums">{t.timer}</span>
                </div>
                <div className="text-[0.5em] opacity-80">{t.meta}</div>
              </div>
              <div className="flex min-h-28 flex-col gap-1.5 p-2.5">
                {t.items.map((item) => (
                  <div key={item.name} className="flex gap-1.5 text-2xs">
                    <span className="font-bold">{item.qty}×</span>
                    <span>
                      {item.name}
                      {item.note ? <span className="block text-[0.85em] text-amber">{item.note}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-2.5 pt-0 text-2xs">
                <span className={`rounded-md py-1.5 text-center ${t.cooking ? "bg-amber-soft text-amber" : "bg-ink-700"}`}>
                  {t.cooking ? "Cooking" : "Start"}
                </span>
                <span className="rounded-md bg-amber py-1.5 text-center font-semibold text-amber-ink">Bump</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-[0.5em]">
          <span className="text-cream-faint">Ready to serve</span>
          <span className="rounded-md bg-ink-700 px-2 py-1">#1922 · Table T3 · 3m</span>
        </div>
      </div>
    </div>
  );
}
