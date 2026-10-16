"use client";

import { useRef, useState, useTransition } from "react";
import { bumpTicketAction, recallLastAction, serveTicketAction, startTicketAction } from "@/app/(till)/kitchen/actions";
import { Icon } from "@/components/icons";
import { STATIONS, type Station } from "@/db/enums";
import type { KitchenBoard, KitchenTicket } from "@/lib/kitchen/service";
import { ticketDestination } from "@/lib/kitchen/shared";
import { ORDER_TYPE_LABELS } from "@/lib/orders/shared";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import { useNow } from "@/lib/use-now";

const ALL = "All stations";
type Filter = typeof ALL | Station;

/** Timer colours from the deck: amber from 10 minutes, red from 15. */
export const AMBER_AFTER_MIN = 10;
export const RED_AFTER_MIN = 15;

function elapsed(from: number, now: number) {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

function urgency(sentAt: number, now: number | null): "fresh" | "amber" | "late" {
  if (now === null) return "fresh";
  const minutes = (now - sentAt) / 60_000;
  return minutes >= RED_AFTER_MIN ? "late" : minutes >= AMBER_AFTER_MIN ? "amber" : "fresh";
}

const HEADER_STYLES = {
  fresh: "bg-eating-soft text-cream",
  amber: "bg-amber-soft text-amber",
  late: "bg-late/35 text-[#ffb4b4]",
};

export function KitchenBoardView({ board }: { board: KitchenBoard }) {
  const now = useNow();
  const [filter, setFilter] = useState<Filter>(ALL);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();
  const gridRef = useRef<HTMLUListElement>(null);
  const seen = useRef<Set<string> | null>(null);

  // Station filter: show only that station's lines, and hide tickets with none.
  const tickets = board.active
    .map((t) => (filter === ALL ? t : { ...t, lines: t.lines.filter((l) => l.station === filter) }))
    .filter((t) => t.lines.length > 0);

  // New tickets slide in with a brief amber glow (not on first load).
  useGSAP(
    () => {
      const ids = board.active.map((t) => t.id);
      if (seen.current === null) {
        seen.current = new Set(ids);
        return;
      }
      const arrived = ids.filter((id) => !seen.current!.has(id));
      ids.forEach((id) => seen.current!.add(id));
      if (arrived.length === 0) return;
      const latest = board.active.find((t) => t.id === arrived[arrived.length - 1])!;
      setAnnouncement(`New ticket: order ${latest.orderNumber}, ${ticketDestination(latest)}`);
      if (prefersReducedMotion()) return;
      const cards = arrived.map((id) => gridRef.current?.querySelector(`[data-ticket="${id}"]`)).filter(Boolean) as Element[];
      gsap.fromTo(cards, { y: -16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: "power3.out", stagger: 0.08 });
      gsap.fromTo(
        cards,
        { boxShadow: "0 0 0 3px rgb(240 169 59 / 0.9)" },
        { boxShadow: "0 0 0 0px rgb(240 169 59 / 0)", duration: 1.6, ease: "power2.out", delay: 0.2 }
      );
    },
    { dependencies: [board.active.map((t) => t.id).join()], scope: gridRef }
  );

  const act = (action: () => Promise<{ ok: boolean; error?: string }>, card?: Element | null) =>
    startTransition(async () => {
      // Bumped cards fade out first so the board doesn't jump.
      if (card && !prefersReducedMotion()) await gsap.to(card, { autoAlpha: 0, scale: 0.96, duration: 0.18, ease: "power2.in" });
      const result = await action();
      if (!result.ok) {
        if (card) gsap.set(card, { autoAlpha: 1, scale: 1 });
        setError(result.error ?? "Something went wrong.");
      } else setError(null);
    });

  const average =
    now !== null && board.active.length
      ? Math.round(board.active.reduce((sum, t) => sum + (now - t.sentAt), 0) / board.active.length / 60_000)
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-ink-700 p-3 sm:gap-3 sm:p-4">
        <h1 className="mr-2 font-display text-2xl font-bold whitespace-nowrap">Kitchen display</h1>
        <div role="group" aria-label="Station" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {[ALL, ...STATIONS].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s as Filter)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${
                filter === s ? "border-amber bg-amber text-amber-ink" : "border-ink-600 text-cream-muted hover:text-cream"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="ml-auto text-sm text-cream-faint">
          {board.active.length} open{average !== null ? ` · average ${average} min` : ""}
        </p>
        <button
          type="button"
          onClick={() => act(recallLastAction)}
          disabled={!board.canRecall || pending}
          className="flex min-h-11 items-center gap-1.5 rounded-xl border border-ink-600 px-3.5 text-sm font-semibold enabled:hover:bg-ink-800 disabled:opacity-40"
        >
          <Icon name="back" className="size-4" />
          Recall last
        </button>
      </header>

      <p role="alert" className="empty:hidden bg-alert-soft px-4 py-2 text-sm text-alert">
        {error}
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {tickets.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-cream-muted">
            <div>
              <Icon name="kitchen" className="mx-auto size-10 text-cream-faint" />
              <p className="mt-3 text-lg">{filter === ALL ? "No tickets right now." : `Nothing for ${filter} right now.`}</p>
              <p className="text-sm text-cream-faint">New orders appear here as soon as they&rsquo;re sent.</p>
            </div>
          </div>
        ) : (
          <ul ref={gridRef} className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(15.5rem,1fr))]">
            {tickets.map((t) => (
              <TicketCard
                key={t.id}
                ticket={t}
                now={now}
                pending={pending}
                onStart={() => act(() => startTicketAction(t.id))}
                onBump={(card) => act(() => bumpTicketAction(t.id), card)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Ready to serve */}
      <div className="flex items-center gap-2 overflow-x-auto border-t border-ink-700 bg-ink-950 px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] sm:px-4 md:pb-2.5">
        <span className="shrink-0 text-sm text-cream-faint">Ready to serve</span>
        {board.ready.length === 0 ? (
          <span className="text-sm text-cream-faint/70">—</span>
        ) : (
          board.ready.map((r) => {
            const where = ticketDestination(r);
            return (
              <button
                key={r.id}
                type="button"
                disabled={pending}
                onClick={() => act(() => serveTicketAction(r.id))}
                data-ready-chip
                title="Tap when it's been taken out"
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-eating/60 bg-eating-soft px-3 text-sm font-semibold hover:bg-eating/30"
              >
                #{r.orderNumber} · {where}
                {now !== null ? <span className="font-normal text-cream-muted">{Math.max(0, Math.floor((now - r.readyAt) / 60_000))}m</span> : null}
                <Icon name="check" className="size-4 text-eating-text" />
                <span className="sr-only">, mark as served</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

type CardProps = {
  ticket: KitchenTicket;
  now: number | null;
  pending: boolean;
  onStart: () => void;
  onBump: (card: Element | null) => void;
};

function TicketCard({ ticket: t, now, pending, onStart, onBump }: CardProps) {
  const level = urgency(t.sentAt, now);
  const meta = [t.tableLabel ? `Table ${t.tableLabel}` : null, ORDER_TYPE_LABELS[t.orderType], t.customerName, t.staffName]
    .filter(Boolean)
    .join(" · ");

  return (
    <li data-ticket={t.id} className="flex flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-850">
      <div className={`px-3.5 py-2.5 transition-colors duration-500 motion-reduce:transition-none ${HEADER_STYLES[level]}`}>
        <div className="flex items-baseline justify-between font-display text-xl font-bold">
          <span>#{t.orderNumber}</span>
          <time className="tabular-nums" aria-label={now !== null ? `${elapsed(t.sentAt, now)} since sent` : undefined}>
            {now !== null ? elapsed(t.sentAt, now) : "--:--"}
          </time>
        </div>
        <p className="truncate text-sm opacity-85">{meta}</p>
      </div>
      <ul className="flex flex-1 flex-col gap-2 p-3.5">
        {t.lines.map((line) => (
          <li key={line.id} className="flex gap-2">
            <span className="w-7 shrink-0 font-bold tabular-nums">{line.quantity}×</span>
            <span className="min-w-0">
              <span className="font-medium">{line.name}</span>
              {line.note ? <span className="block text-sm text-amber">{line.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2 p-3.5 pt-0">
        {t.status === "cooking" ? (
          <span className="grid min-h-12 place-items-center rounded-xl bg-amber-soft font-semibold text-amber">Cooking</span>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={pending}
            className="min-h-12 rounded-xl bg-ink-700 font-semibold enabled:hover:bg-ink-600 enabled:active:scale-[0.97] disabled:opacity-50"
          >
            Start
          </button>
        )}
        <button
          type="button"
          onClick={(e) => onBump(e.currentTarget.closest("[data-ticket]"))}
          disabled={pending}
          aria-label={`Bump order ${t.orderNumber}: ready`}
          className="min-h-12 rounded-xl bg-amber font-semibold text-amber-ink enabled:hover:bg-[#f5b552] enabled:active:scale-[0.97] disabled:opacity-50"
        >
          Bump
        </button>
      </div>
    </li>
  );
}
