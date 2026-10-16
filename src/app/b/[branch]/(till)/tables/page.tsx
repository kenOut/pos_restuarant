import type { Metadata } from "next";
import { FloorPlan } from "@/components/tables/floor-plan";
import { requireStaff } from "@/lib/auth/session";
import { canArrange, ensureDefaultAreas, getFloor, listServers } from "@/lib/tables/service";
import { getDb } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Tables" };

export default async function TablesPage() {
  const person = await requireStaff("tables");
  const db = await getDb();
  // Branches set up before the floor plan existed get Main hall, Terrace and Bar.
  ensureDefaultAreas(db, person.restaurantId);
  return <FloorPlan floor={getFloor(db, person.restaurantId)} servers={listServers(db, person.restaurantId)} canArrange={canArrange(person.role)} />;
}
