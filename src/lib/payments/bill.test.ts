import { describe, expect, it } from "vitest";
import { cedis } from "@/lib/money";
import { DEFAULT_TAX_CONFIG, type TaxConfig } from "@/lib/tax-config";
import { computeBill, parseCedis, percentOf, taxLinesForDisplay } from "./bill";

const deckOrder = [
  { unitPrice: cedis(90), quantity: 2 },
  { unitPrice: cedis(120), quantity: 1 },
  { unitPrice: cedis(20), quantity: 2 },
];

describe("computeBill", () => {
  it("matches the deck with no discount or tip: 340.00 → 408.00", () => {
    const bill = computeBill(deckOrder);
    expect(bill).toMatchObject({ subtotal: cedis(340), discount: 0, tip: 0, total: cedis(408) });
  });

  it("takes the discount off before tax", () => {
    const bill = computeBill(deckOrder, { discount: cedis(40) });
    // Taxed on 300.00: VAT 45.00, NHIL 7.50, GETFund 7.50
    expect(bill.taxes.map((t) => t.amount)).toEqual([cedis(45), cedis(7.5), cedis(7.5)]);
    expect(bill.total).toBe(cedis(360));
  });

  it("adds the tip after tax, untaxed", () => {
    const bill = computeBill(deckOrder, { tip: cedis(20) });
    expect(bill.taxes.map((t) => t.amount)).toEqual([cedis(51), cedis(8.5), cedis(8.5)]);
    expect(bill.total).toBe(cedis(428));
  });

  it("never discounts below zero", () => {
    const bill = computeBill(deckOrder, { discount: cedis(1000) });
    expect(bill.discount).toBe(cedis(340));
    expect(bill.total).toBe(0);
  });
});

describe("computeBill with the restaurant's tax settings", () => {
  const settings = (change: Partial<TaxConfig> = {}, taxes: Partial<Record<string, Partial<TaxConfig["taxes"][number]>>> = {}): TaxConfig => ({
    ...DEFAULT_TAX_CONFIG,
    ...change,
    taxes: DEFAULT_TAX_CONFIG.taxes.map((t) => ({ ...t, ...taxes[t.id] })),
  });

  it("charges nothing when the business isn't VAT registered", () => {
    const bill = computeBill(deckOrder, {}, settings({ vatRegistered: false }));
    expect(bill.taxes).toEqual([]);
    expect(bill.total).toBe(cedis(340));
  });

  it("skips a tax that's switched off and uses changed rates", () => {
    const bill = computeBill(deckOrder, {}, settings({}, { getfund: { charge: false }, vat: { rateBp: 1250 } }));
    expect(bill.taxes.map((t) => [t.label, t.amount])).toEqual([
      ["VAT (12.5%)", cedis(42.5)],
      ["NHIL (2.5%)", cedis(8.5)],
    ]);
    expect(bill.total).toBe(cedis(391));
  });

  it("folds taxes not on their own line into the combined line", () => {
    const bill = computeBill(deckOrder, {}, settings({ combinedLabel: "Levies" }, { nhil: { ownLine: false }, getfund: { ownLine: false } }));
    expect(taxLinesForDisplay(bill.taxes)).toEqual([
      { label: "VAT (15%)", amount: cedis(51) },
      { label: "Levies", amount: cedis(17) },
    ]);
    expect(bill.total).toBe(cedis(408));
  });

  it("works taxes out of tax-inclusive prices, and the lines still add up", () => {
    const bill = computeBill(deckOrder, { tip: cedis(10) }, settings({ pricesIncludeTax: true }));
    // 340.00 includes 20% tax: net 283.33; VAT 42.50 (+1 pesewa rounding), NHIL 7.08, GETFund 7.08
    expect(bill.total).toBe(cedis(350));
    const taxTotal = bill.taxes.reduce((sum, t) => sum + t.amount, 0);
    expect(cedis(283.33) + taxTotal).toBe(cedis(340));
    expect(bill.taxes.map((t) => t.amount)).toEqual([cedis(42.51), cedis(7.08), cedis(7.08)]);
  });
});

describe("helpers", () => {
  it("works out percentages to the pesewa", () => {
    expect(percentOf(cedis(340), 10)).toBe(cedis(34));
    expect(percentOf(cedis(145), 15)).toBe(cedis(21.75));
  });

  it("parses typed amounts", () => {
    expect(parseCedis("408.00")).toBe(cedis(408));
    expect(parseCedis("408")).toBe(cedis(408));
    expect(parseCedis("12.5")).toBe(cedis(12.5));
    expect(parseCedis("1,000")).toBeNull();
    expect(parseCedis("-5")).toBeNull();
    expect(parseCedis("1.234")).toBeNull();
  });
});
