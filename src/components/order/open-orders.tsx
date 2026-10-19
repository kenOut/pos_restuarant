"use client";

import { forwardRef } from "react";
import { Icon } from "@/components/icons";
import type { OrderSummary } from "@/lib/orders/service";
import { ORDER_TYPE_LABELS, formatOrderNumber } from "@/lib/orders/shared";
import { formatCedis } from "@/lib/money";

type Props = {
  orders: OrderSummary[];
  currentId: string | null;
  /** When the list was opened (Unix ms), for "12 min ago"; null while closed. */
  openedAt: number | null;
  onOpen: (id: string) => void;
  onClose: () => void;
};

const STATUS = {
  held: { label: "Held", className: "bg-amber-soft text-amber" },
  sent: { label: "Sent to kitchen", className: "bg-ink-700 text-cream" },
  cooking: { label: "Cooking", className: "bg-amber-soft text-amber" },
  ready: { label: "Ready to serve", className: "bg-eating-strong text-white" },
  served: { label: "Served", className: "bg-eating-soft text-eating-text" },
};

/** Where the order stands: held at the till, or how far the kitchen has got. */
function statusOf(o: OrderSummary): keyof typeof STATUS {
  return o.kitchen === "none" ? "held" : o.kitchen;
}

function ago(from: number, now: number) {
  const minutes = Math.max(0, Math.round((now - from) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
}

/** Held and in-kitchen orders on this restaurant's tills, to pick up again. */
export const OpenOrdersDialog = forwardRef<HTMLDialogElement, Props>(function OpenOrdersDialog(
  { orders, currentId, openedAt, onOpen, onClose },
  ref
) {
  return (
    <dialog
      ref={ref}
      aria-labelledby="open-orders-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto max-h-[85dvh] w-[min(36rem,calc(100%-2rem))] overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 p-0 text-cream backdrop:bg-black/60"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between border-b border-ink-700 p-4">
          <h2 id="open-orders-title" className="font-display text-xl font-bold">
            Open orders
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-xl hover:bg-ink-800">
            <Icon name="plus" className="size-5 rotate-45" />
          </button>
        </div>
        {orders.length === 0 ? (
          <p className="p-8 text-center text-cream-muted">No held or open orders.</p>
        ) : (
          <ul className="divide-y divide-ink-700 overflow-y-auto">
            {orders.map((o) => {
              const detail = o.tableLabel ? `Table ${o.tableLabel}` : o.customerName;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(o.id)}
                    aria-current={o.id === currentId ? "true" : undefined}
                    className="flex w-full items-center gap-3 p-4 text-left hover:bg-ink-850 aria-[current=true]:bg-amber-soft"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-lg font-bold">#{formatOrderNumber(o.number)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[statusOf(o)].className}`}>
                          {STATUS[statusOf(o)].label}
                        </span>
                        {o.paid > 0 ? (
                          <span className="rounded-full bg-reserved-soft px-2 py-0.5 text-xs font-semibold text-cream">Part paid</span>
                        ) : null}
                        {o.status === "open" && o.hasUnsent ? (
                          <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber">Items waiting</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-cream-muted">
                        {ORDER_TYPE_LABELS[o.type]}
                        {detail ? ` · ${detail}` : ""} · {o.staffName}
                        {openedAt ? ` · ${ago(o.updatedAt, openedAt)}` : ""}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{formatCedis(o.total)}</span>
                      <span className="text-sm text-cream-faint">
                        {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </dialog>
  );
});
