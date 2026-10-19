"use client";

import Link from "next/link";
import { useBranchPath } from "@/components/tenancy/branch-context";
import { formatCedis } from "@/lib/money";
import type { KitchenProgress, OrderSummary } from "@/lib/orders/service";
import { ORDER_TYPE_LABELS, formatOrderNumber } from "@/lib/orders/shared";
import { useNow } from "@/lib/use-now";

const KITCHEN: Record<KitchenProgress, { label: string; className: string }> = {
  none: { label: "Not sent", className: "bg-ink-700 text-cream" },
  sent: { label: "Sent", className: "bg-amber-soft text-cream" },
  cooking: { label: "Cooking", className: "bg-amber-soft text-cream" },
  ready: { label: "Ready", className: "bg-eating-soft text-cream" },
  served: { label: "Served", className: "bg-eating-soft text-cream" },
};

function openFor(openedAt: number, now: number | null): string {
  if (now === null) return "–";
  const minutes = Math.max(0, Math.floor((now - openedAt) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** Every order open right now, oldest first, updated live as tills and the kitchen work. */
export function LiveOrders({ orders }: { orders: OrderSummary[] }) {
  const now = useNow();
  const branchPath = useBranchPath();
  if (orders.length === 0) return <p className="rounded-2xl border border-ink-700 bg-ink-850 p-6 text-center text-cream-muted">No orders open right now.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
      {orders.map((o) => {
        const k = KITCHEN[o.kitchen];
        const minutes = now === null ? 0 : (now - o.openedAt) / 60_000;
        return (
          <li key={o.id} data-order={o.number}>
            <Link
              href={branchPath(`/office/orders/${o.id}`)}
              className={`block rounded-2xl border bg-ink-850 p-4 hover:bg-ink-800 ${minutes >= 45 ? "border-alert" : "border-ink-700"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-lg font-bold">
                  #{formatOrderNumber(o.number)}
                  <span className="ml-2 text-sm font-normal text-cream-muted">
                    {o.tableLabel ? `Table ${o.tableLabel}` : o.customerName ?? ORDER_TYPE_LABELS[o.type]}
                  </span>
                </p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${k.className}`}>{k.label}</span>
              </div>
              <p className="mt-1 text-sm text-cream-muted">
                {ORDER_TYPE_LABELS[o.type]} · {o.staffName} · open <span className="tabular-nums">{openFor(o.openedAt, now)}</span>
              </p>
              <p className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm">
                  {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                  {o.billPrinted ? " · bill printed" : ""}
                  {o.hasUnsent ? " · not all sent" : ""}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatCedis(o.total)}
                  {o.paid ? <span className="ml-1 text-xs font-normal text-cream-muted">({formatCedis(o.paid)} paid)</span> : null}
                </span>
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
