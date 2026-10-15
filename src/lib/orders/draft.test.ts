import { describe, expect, it } from "vitest";
import { cedis } from "@/lib/money";
import { addItem, changeQuantity, draftTotals, emptyDraft, itemCount, quantitiesByItem, setNote, toSaveInput, unsentCount } from "./draft";
import type { MenuEntry } from "./service";

const jollof: MenuEntry = { id: "jollof-chicken", name: "Jollof rice with chicken", category: "Mains", station: "Kitchen", price: cedis(90), available: true };
const sobolo: MenuEntry = { id: "sobolo", name: "Sobolo", category: "Drinks", station: "Bar", price: cedis(20), available: true };
const sorbet: MenuEntry = { id: "pineapple-sorbet", name: "Pineapple sorbet", category: "Desserts", station: "Kitchen", price: cedis(35), available: false };

describe("draft", () => {
  it("adds items, merging repeats into one line", () => {
    let d = addItem(emptyDraft(), jollof);
    d = addItem(d, jollof);
    d = addItem(d, sobolo);
    expect(d.lines.map((l) => [l.name, l.quantity])).toEqual([
      ["Jollof rice with chicken", 2],
      ["Sobolo", 1],
    ]);
    expect(d.dirty).toBe(true);
  });

  it("starts a new line when the existing one has a note", () => {
    let d = addItem(emptyDraft(), jollof);
    d = setNote(d, d.lines[0].key, "No pepper");
    d = addItem(d, jollof);
    expect(d.lines.map((l) => [l.quantity, l.note])).toEqual([
      [1, "No pepper"],
      [1, ""],
    ]);
  });

  it("ignores sold-out items", () => {
    expect(addItem(emptyDraft(), sorbet).lines).toHaveLength(0);
  });

  it("removes a line when its quantity drops to zero", () => {
    let d = addItem(emptyDraft(), jollof);
    d = changeQuantity(d, d.lines[0].key, -1);
    expect(d.lines).toHaveLength(0);
  });

  it("counts, totals and badges include sent lines", () => {
    let d = addItem(emptyDraft(), jollof);
    d = { ...d, sent: [{ id: "x", menuItemId: "jollof-chicken", name: "Jollof rice with chicken", unitPrice: cedis(90), station: "Kitchen", quantity: 1, note: null, sentAt: 1 }] };
    expect(itemCount(d)).toBe(2);
    expect(unsentCount(d)).toBe(1);
    expect(quantitiesByItem(d).get("jollof-chicken")).toBe(2);
    expect(draftTotals(d).total).toBe(cedis(216)); // 180 + 20%
  });

  it("sends only unsent lines, without prices", () => {
    const d = addItem(emptyDraft(), jollof);
    expect(toSaveInput(d, true).lines).toEqual([{ menuItemId: "jollof-chicken", quantity: 1, note: "" }]);
  });
});
