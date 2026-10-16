// Report periods (today, this week, your own dates...). No database imports, so screens can use it.

export const PERIODS = ["today", "yesterday", "week", "month", "custom"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABELS: Record<Period, string> = { today: "Today", yesterday: "Yesterday", week: "This week", month: "This month", custom: "Dates" };

/** [from, to): from midnight on the first day to midnight after the last. */
export type Range = { from: Date; to: Date };
export type ResolvedRange = Range & { period: Period; fromDay: string; toDay: string; label: string };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** "2026-10-16" in local time. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function parseDay(value: string | undefined | null): Date | null {
  if (!value || !DAY_PATTERN.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** The longest range a custom report covers. */
export const MAX_RANGE_DAYS = 366;

/**
 * A period from the screen or the API: today, yesterday, this week (from
 * Monday), this month, or custom dates (inclusive). Bad or missing custom
 * dates fall back to today.
 */
export function resolveRange(period: string | undefined, fromDay?: string | null, toDay?: string | null, now = new Date()): ResolvedRange {
  const today = startOfDay(now);
  let from = today;
  let to = addDays(today, 1);
  let chosen: Period = PERIODS.includes(period as Period) ? (period as Period) : "today";
  if (chosen === "yesterday") {
    from = addDays(today, -1);
    to = today;
  } else if (chosen === "week") {
    from = addDays(today, -((today.getDay() + 6) % 7));
  } else if (chosen === "month") {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (chosen === "custom") {
    const a = parseDay(fromDay);
    const b = parseDay(toDay) ?? a;
    if (a && b) {
      const [first, last] = a <= b ? [a, b] : [b, a];
      from = first;
      to = addDays(last, 1);
      if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) from = addDays(to, -MAX_RANGE_DAYS);
    } else chosen = "today";
  }
  const lastDay = addDays(to, -1);
  const label = dayKey(from) === dayKey(lastDay) ? longDay.format(from) : `${longDay.format(from)} – ${longDay.format(lastDay)}`;
  return { from, to, period: chosen, fromDay: dayKey(from), toDay: dayKey(lastDay), label };
}
