import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { PayScreen } from "@/components/pay/pay-screen";
import { getDb } from "@/lib/tenancy/context";
import { staff } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { getPaymentView } from "@/lib/payments/service";

export const metadata: Metadata = { title: "Payment" };

export default async function PayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const person = await requireStaff("order");
  const { orderId } = await params;
  const db = await getDb();
  const view = getPaymentView(db, person.restaurantId, orderId);
  if (!view) notFound();

  // Who can approve a discount on this till (owners and managers).
  const approvers = db
    .select({ id: staff.id, name: staff.name })
    .from(staff)
    .where(and(eq(staff.restaurantId, person.restaurantId), eq(staff.active, true), inArray(staff.role, ["owner", "manager"])))
    .orderBy(asc(staff.name))
    .all();

  return (
    <PayScreen
      view={view}
      cashierName={person.name}
      // No PIN needed if they're an owner or manager, or the restaurant has switched approval off.
      canApproveDiscounts={person.role === "owner" || person.role === "manager" || !view.discountNeedsApproval}
      approvers={approvers}
    />
  );
}
