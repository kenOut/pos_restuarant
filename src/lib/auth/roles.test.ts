import { describe, expect, it } from "vitest";
import { STAFF_ROLES } from "@/db/schema";
import { canAccess, homePathFor, navFor } from "./roles";

const ids = (role: Parameters<typeof navFor>[0]) => navFor(role).map((n) => n.id);

describe("navFor", () => {
  it("gives owners and managers every section, in the deck's order", () => {
    const all = ["home", "tables", "order", "kitchen", "orders", "bookings", "menu", "stock", "staff", "guests", "reports", "reviews", "settings"];
    expect(ids("owner")).toEqual(all);
    expect(ids("manager")).toEqual(all);
  });

  it("gives kitchen staff only the kitchen display", () => {
    expect(ids("kitchen")).toEqual(["kitchen"]);
  });

  it("keeps management sections away from front-of-house staff", () => {
    for (const role of ["cashier", "server", "bartender"] as const) {
      for (const id of ["menu", "stock", "staff", "reports", "reviews", "settings"]) expect(ids(role)).not.toContain(id);
      expect(ids(role)).toContain("order");
    }
  });

  it("links only the screens that exist so far", () => {
    const linked = navFor("owner").filter((n) => n.href).map((n) => [n.id, n.href]);
    expect(linked).toEqual([
      ["order", "/order"],
      ["kitchen", "/kitchen"],
      ["menu", "/menu"],
      ["staff", "/staff"],
      ["settings", "/settings"],
    ]);
  });
});

describe("access and landing", () => {
  it("matches what the sidebar shows", () => {
    for (const role of STAFF_ROLES) {
      expect(canAccess(role, "order")).toBe(ids(role).includes("order"));
      expect(canAccess(role, "kitchen")).toBe(ids(role).includes("kitchen"));
    }
  });

  it("sends kitchen staff to the kitchen and everyone else to Order", () => {
    expect(homePathFor("kitchen")).toBe("/kitchen");
    expect(homePathFor("cashier")).toBe("/order");
  });
});
