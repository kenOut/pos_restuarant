import { describe, expect, it } from "vitest";
import { cedis } from "@/lib/money";
import { computeBill, parseCedis, percentOf } from "./bill";

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
