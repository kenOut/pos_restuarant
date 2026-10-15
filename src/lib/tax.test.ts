import { describe, expect, it } from "vitest";
import { cedis, formatCedis } from "./money";
import { calculateBill } from "./tax";

describe("calculateBill", () => {
  it("matches the deck's tablet order: 340.00 → 408.00", () => {
    // 2× Jollof rice with chicken, 1× Banku and tilapia, 2× Sobolo
    const bill = calculateBill([
      { unitPrice: cedis(90), quantity: 2 },
      { unitPrice: cedis(120), quantity: 1 },
      { unitPrice: cedis(20), quantity: 2 },
    ]);
    expect(bill.subtotal).toBe(cedis(340));
    expect(bill.taxes.map((t) => t.amount)).toEqual([cedis(51), cedis(8.5), cedis(8.5)]);
    expect(bill.total).toBe(cedis(408));
  });

  it("rounds each tax line and sums the rounded lines: 145.00 → 174.01", () => {
    // 1× Kelewele, 2× Chicken wings (the deck's phone order)
    const bill = calculateBill([
      { unitPrice: cedis(35), quantity: 1 },
      { unitPrice: cedis(55), quantity: 2 },
    ]);
    expect(bill.subtotal).toBe(cedis(145));
    expect(bill.taxes.map((t) => t.amount)).toEqual([cedis(21.75), cedis(3.63), cedis(3.63)]);
    expect(bill.total).toBe(cedis(174.01));
  });

  it("returns zeros for an empty bill", () => {
    const bill = calculateBill([]);
    expect(bill.total).toBe(0);
    expect(bill.taxes.every((t) => t.amount === 0)).toBe(true);
  });
});

describe("formatCedis", () => {
  it("formats with two decimals and thousands separators", () => {
    expect(formatCedis(cedis(408))).toBe("GH₵ 408.00");
    expect(formatCedis(cedis(64782))).toBe("GH₵ 64,782.00");
    expect(formatCedis(cedis(3.63))).toBe("GH₵ 3.63");
  });
});
