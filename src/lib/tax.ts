import type { Pesewas } from "./money";

export type TaxRate = {
  id: string;
  label: string;
  /** Rate in basis points: 15% = 1500, 2.5% = 250. */
  basisPoints: number;
};

/** Ghana's standard rates from 1 January 2026: VAT 15% + NHIL 2.5% + GETFund 2.5%. */
export const GHANA_2026_RATES: readonly TaxRate[] = [
  { id: "vat", label: "VAT (15%)", basisPoints: 1500 },
  { id: "nhil", label: "NHIL (2.5%)", basisPoints: 250 },
  { id: "getfund", label: "GETFund Levy (2.5%)", basisPoints: 250 },
];

export type BillLine = { unitPrice: Pesewas; quantity: number };

export type BillTotals = {
  subtotal: Pesewas;
  taxes: { id: string; label: string; amount: Pesewas }[];
  total: Pesewas;
};

/**
 * Taxes are charged on top of the subtotal. Each tax line is rounded to the
 * nearest pesewa (halves round up) and the total is the sum of the rounded
 * lines, so the printed receipt always adds up.
 * Example: subtotal 145.00 → VAT 21.75, NHIL 3.63, GETFund 3.63, total 174.01.
 */
export function calculateBill(lines: readonly BillLine[], rates: readonly TaxRate[] = GHANA_2026_RATES): BillTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const taxes = rates.map((rate) => ({
    id: rate.id,
    label: rate.label,
    amount: Math.round((subtotal * rate.basisPoints) / 10_000),
  }));
  const total = subtotal + taxes.reduce((sum, tax) => sum + tax.amount, 0);
  return { subtotal, taxes, total };
}
