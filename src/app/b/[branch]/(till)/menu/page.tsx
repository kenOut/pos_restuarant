import type { Metadata } from "next";
import { MenuManager } from "@/components/menu/menu-manager";
import { getDb } from "@/lib/tenancy/context";
import { requireStaff } from "@/lib/auth/session";
import { listCategories, listMenuAdmin } from "@/lib/menu/service";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage() {
  const person = await requireStaff("menu");
  const db = await getDb();
  return <MenuManager categories={listCategories(db, person.restaurantId)} items={listMenuAdmin(db, person.restaurantId)} />;
}
