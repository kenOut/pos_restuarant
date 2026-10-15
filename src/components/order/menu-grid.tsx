"use client";

import type { MenuEntry } from "@/lib/orders/service";
import { formatAmount } from "@/lib/money";

type Props = {
  items: MenuEntry[];
  quantities: Map<string, number>;
  onAdd: (item: MenuEntry) => void;
};

/** Tap a dish to add one to the ticket. Sold-out dishes are greyed out and can't be tapped. */
export function MenuGrid({ items, quantities, onAdd }: Props) {
  if (items.length === 0) {
    return <p className="py-16 text-center text-cream-muted">No dishes or drinks match your search.</p>;
  }

  return (
    // As many columns as fit at a readable card width, so prices never wrap.
    <ul className="grid grid-cols-2 gap-2 sm:[grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))]">
      {items.map((item) => {
        const qty = quantities.get(item.id) ?? 0;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onAdd(item)}
              disabled={!item.available}
              className={`relative flex min-h-20 w-full flex-col justify-between gap-2 rounded-xl border p-3 text-left transition duration-100 motion-reduce:transition-none ${
                !item.available
                  ? "cursor-not-allowed border-ink-800 bg-ink-900 text-cream-faint"
                  : qty
                    ? "border-amber/80 bg-amber-soft active:scale-[0.97]"
                    : "border-ink-700 bg-ink-850 hover:border-ink-600 hover:bg-ink-800 active:scale-[0.97]"
              }`}
            >
              <span className={`leading-tight font-medium ${item.available ? "" : "line-through decoration-cream-faint/60"}`}>{item.name}</span>
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold whitespace-nowrap tabular-nums">GH₵ {formatAmount(item.price)}</span>
                <span className={`whitespace-nowrap ${item.available ? "text-cream-faint" : "font-semibold text-alert"}`}>{item.available ? item.station : "Sold out"}</span>
              </span>
              {qty ? (
                <span
                  key={qty}
                  aria-hidden="true"
                  className="absolute -top-2 -right-2 grid size-6 animate-pop place-items-center rounded-full bg-amber text-xs font-bold text-amber-ink shadow"
                >
                  {qty}
                </span>
              ) : null}
              {qty ? <span className="sr-only">, {qty} on the ticket</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
