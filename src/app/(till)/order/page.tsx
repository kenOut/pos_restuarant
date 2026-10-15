import type { Metadata } from "next";
import { OrderScreen } from "@/components/order/order-screen";
import { getDb } from "@/db";
import { requireStaff } from "@/lib/auth/session";
import { getOrderDetail, listMenu, listOpenOrders } from "@/lib/orders/service";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const person = await requireStaff("order");
  const db = getDb();
  const { open } = await searchParams;
  const opened = typeof open === "string" ? getOrderDetail(db, person.restaurantId, open) : null;

  return (
    <OrderScreen
      menu={listMenu(db, person.restaurantId)}
      openOrders={listOpenOrders(db, person.restaurantId)}
      staffName={person.name}
      initialOrder={opened && opened.status !== "paid" ? opened : null}
    />
  );
}
