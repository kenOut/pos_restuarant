// What the guest owes. Shared by the server and the till screens (no server-only imports).
import type { Pesewas } from "@/lib/money";
import type { BillLine } from "@/lib/tax";
import { chargedTaxes, DEFAULT_TAX_CONFIG, type TaxConfig } from "@/lib/tax-config";

export type BillTax = {
  id: string;
  label: string;
  amount: Pesewas;
  /** Null: its own receipt line. Otherwise the combined line it's folded into. */
  displayAs: string | null;
};

export type Bill = {
  subtotal: Pesewas;
  /** Taken off before tax. */
  discount: Pesewas;
  taxes: BillTax[];
  /** Added after tax; not taxed. */
  tip: Pesewas;
  total: Pesewas;
  /** The taxes are inside the menu prices rather than added on top. */
  pricesIncludeTax: boolean;
};

/**
 * Discount comes off the subtotal first, so tax is charged on what the guest
 * actually pays for. The tip is added last and isn't taxed. A discount can't
 * exceed the subtotal.
 *
 * Taxes on top (the default): each tax is rounded to the pesewa and the total
 * is the sum of the rounded lines, so the receipt always adds up.
 * Tax-inclusive prices: the discounted subtotal already contains the taxes;
 * they're worked out of it, with any rounding pesewa put on the first tax so
 * the lines still add up to what the guest pays.
 */
export function computeBill(
  lines: readonly BillLine[],
  { discount = 0, tip = 0 }: { discount?: Pesewas; tip?: Pesewas } = {},
  config: TaxConfig = DEFAULT_TAX_CONFIG
): Bill {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const appliedDiscount = Math.min(Math.max(0, Math.round(discount)), subtotal);
  const appliedTip = Math.max(0, Math.round(tip));
  const base = subtotal - appliedDiscount;
  const charged = chargedTaxes(config);

  let taxes: BillTax[];
  let total: Pesewas;
  if (!config.pricesIncludeTax) {
    taxes = charged.map((t) => ({ id: t.id, label: t.label, displayAs: t.displayAs, amount: Math.round((base * t.rateBp) / 10_000) }));
    total = base + taxes.reduce((sum, t) => sum + t.amount, 0) + appliedTip;
  } else {
    const totalBp = charged.reduce((sum, t) => sum + t.rateBp, 0);
    const net = Math.round((base * 10_000) / (10_000 + totalBp));
    taxes = charged.map((t) => ({ id: t.id, label: t.label, displayAs: t.displayAs, amount: Math.round((net * t.rateBp) / 10_000) }));
    const rounding = base - net - taxes.reduce((sum, t) => sum + t.amount, 0);
    if (taxes.length) taxes[0].amount += rounding;
    total = base + appliedTip;
  }

  return { subtotal, discount: appliedDiscount, taxes, tip: appliedTip, total, pricesIncludeTax: config.pricesIncludeTax };
}

/** Receipt lines for the taxes: own-line taxes as they are, the rest folded into their combined line. */
export function taxLinesForDisplay(taxes: readonly { label: string; amount: Pesewas; displayAs?: string | null }[]) {
  const lines: { label: string; amount: Pesewas }[] = [];
  for (const t of taxes) {
    const label = t.displayAs ?? t.label;
    const existing = t.displayAs ? lines.find((l) => l.label === label) : undefined;
    if (existing) existing.amount += t.amount;
    else lines.push({ label, amount: t.amount });
  }
  return lines;
}

/** pct% of an amount, to the nearest pesewa. */
export function percentOf(amount: Pesewas, pct: number): Pesewas {
  return Math.round((amount * pct) / 100);
}

/** "408.00" / "408" / "408.5" → pesewas, or null if it isn't a valid amount. */
export function parseCedis(text: string): Pesewas | null {
  const match = /^\s*(\d{1,7})(?:\.(\d{0,2}))?\s*$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
