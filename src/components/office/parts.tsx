import Link from "next/link";
import type { ReactNode } from "react";
import { PERIODS, PERIOD_LABELS, type ResolvedRange } from "@/lib/office/periods";

/** Shared pieces of the back office screens. Server components: no hooks. */

export function OfficeHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-3 border-b border-ink-700 p-3 sm:p-4">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {description ? <p className="text-sm text-cream-muted">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}

/** Builds an address with query parameters, leaving out empty ones. */
export function withQuery(path: string, params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * Today / Yesterday / This week / This month, or your own dates. `keep` holds
 * the screen's other filters so changing the period doesn't lose them.
 */
export function PeriodPicker({ path, range, keep = {} }: { path: string; range: ResolvedRange; keep?: Record<string, string | null | undefined> }) {
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${active ? "border-amber bg-amber-soft text-cream" : "border-ink-700 bg-ink-850 text-cream-muted hover:text-cream"}`;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <nav aria-label="Period" className="flex flex-wrap gap-2">
        {PERIODS.filter((p) => p !== "custom").map((p) => (
          <Link key={p} href={withQuery(path, { ...keep, period: p })} aria-current={range.period === p ? "true" : undefined} className={chip(range.period === p)}>
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </nav>
      <form action={path} className="flex flex-wrap items-end gap-2">
        {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <input type="hidden" name="period" value="custom" />
        <label className="text-sm text-cream-muted">
          From
          <input type="date" name="from" defaultValue={range.fromDay} required className="mt-1 block h-11 rounded-xl border border-ink-600 bg-ink-900 px-2 text-cream" />
        </label>
        <label className="text-sm text-cream-muted">
          To
          <input type="date" name="to" defaultValue={range.toDay} required className="mt-1 block h-11 rounded-xl border border-ink-600 bg-ink-900 px-2 text-cream" />
        </label>
        <button type="submit" className={chip(range.period === "custom")}>
          Show
        </button>
      </form>
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850 p-4">
      <dt className="text-sm text-cream-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</dd>
      {note ? <dd className="mt-0.5 text-xs text-cream-faint">{note}</dd> : null}
    </div>
  );
}

export function Pager({ path, page, pages, params }: { path: string; page: number; pages: number; params: Record<string, string | null | undefined> }) {
  if (pages <= 1) return null;
  const link = "inline-flex min-h-11 items-center rounded-xl border border-ink-600 px-4 text-sm font-semibold hover:bg-ink-800";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 p-3 text-sm sm:p-4">
      {page > 1 ? <Link className={link} href={withQuery(path, { ...params, page: page - 1 })}>Previous</Link> : <span />}
      <span className="text-cream-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? <Link className={link} href={withQuery(path, { ...params, page: page + 1 })}>Next</Link> : <span />}
    </nav>
  );
}

/** A table that scrolls sideways inside its box on small screens, never the page. */
export function DataTable({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-700">
      <table className="w-full min-w-[40rem] text-left text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2.5 [&_thead_th]:bg-ink-850 [&_thead_th]:font-semibold [&_thead_th]:text-cream-muted [&_tbody_tr]:border-t [&_tbody_tr]:border-ink-700">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export const selectClass = "mt-1 block h-11 rounded-xl border border-ink-600 bg-ink-900 px-2 text-cream";
export const buttonLinkClass = "inline-flex min-h-11 items-center rounded-xl border border-ink-600 px-4 text-sm font-semibold hover:bg-ink-800";
