import type { Metadata } from "next";
import { KitchenBoardView } from "@/components/kitchen/kitchen-board";
import { getDb } from "@/lib/tenancy/context";
import { requireStaff } from "@/lib/auth/session";
import { getKitchenBoard } from "@/lib/kitchen/service";

export const metadata: Metadata = { title: "Kitchen" };

export default async function KitchenPage() {
  const person = await requireStaff("kitchen");
  return <KitchenBoardView board={getKitchenBoard((await getDb()), person.restaurantId)} />;
}
