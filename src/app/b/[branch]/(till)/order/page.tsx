import type { Metadata } from "next";
import { OrderScreen } from "@/components/order/order-screen";
import { getDb } from "@/lib/tenancy/context";
import { requireStaff } from "@/lib/auth/session";
import { canManageMenu } from "@/lib/menu/service";
import { getOrderDetail, listMenu, listOpenOrders } from "@/lib/orders/service";
import { getTaxConfig } from "@/lib/settings/service";
import { listTableOptions } from "@/lib/tables/service";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ open?: string; table?: string }> }) {
  const person = await requireStaff("order");
  const db = await getDb();
  const { open, table } = await searchParams;
  const tables = listTableOptions(db, person.restaurantId);
  // From the floor plan: a table's open order, or a new order for that table.
  const picked = typeof table === "string" ? tables.find((t) => t.id === table) : undefined;
  const orderId = typeof open === "string" ? open : picked?.orderId;
  const opened = orderId ? getOrderDetail(db, person.restaurantId, orderId) : null;

  return (
    <OrderScreen
      // A fresh screen for each table or order picked from the floor plan (but not when the
      // page refreshes after a save, which would reopen the order just held).
      key={`${typeof open === "string" ? open : ""}:${typeof table === "string" ? table : ""}`}
      menu={listMenu(db, person.restaurantId)}
      openOrders={listOpenOrders(db, person.restaurantId)}
      tables={tables}
      staffName={person.name}
      initialOrder={opened && opened.status !== "paid" ? opened : null}
      initialTable={picked && !picked.orderId ? { id: picked.id, label: picked.label } : null}
      taxConfig={getTaxConfig(db, person.restaurantId)}
      canMarkSoldOut={canManageMenu(person.role)}
    />
  );
}
