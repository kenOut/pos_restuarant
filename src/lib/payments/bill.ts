// What the guest owes. Shared by the server and the pay screen (no server-only imports).
import type { Pesewas } from "@/lib/money";
import { calculateBill, GHANA_2026_RATES, type BillLine, type TaxRate } from "@/lib/tax";

export type Bill = {
  subtotal: Pesewas;
  /** Taken off before tax. */
  discount: Pesewas;
  taxes: { id: string; label: string; amount: Pesewas }[];
  /** Added after tax; not taxed. */
  tip: Pesewas;
  total: Pesewas;
};

/**
 * Discount comes off the subtotal first, so tax is charged on what the guest
 * actually pays for. Taxes are rounded per line (see calculateBill). The tip is
 * added last and isn't taxed. A discount can't exceed the subtotal.
 */
export function computeBill(
  lines: readonly BillLine[],
  { discount = 0, tip = 0 }: { discount?: Pesewas; tip?: Pesewas } = {},
  rates: readonly TaxRate[] = GHANA_2026_RATES
): Bill {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const appliedDiscount = Math.min(Math.max(0, Math.round(discount)), subtotal);
  const taxed = calculateBill([{ unitPrice: subtotal - appliedDiscount, quantity: 1 }], rates);
  const appliedTip = Math.max(0, Math.round(tip));
  return {
    subtotal,
    discount: appliedDiscount,
    taxes: taxed.taxes,
    tip: appliedTip,
    total: taxed.total + appliedTip,
  };
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
