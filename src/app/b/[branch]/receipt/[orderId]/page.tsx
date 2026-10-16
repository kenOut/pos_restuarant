import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintControls } from "@/components/pay/print-controls";
import { Receipt } from "@/components/pay/receipt";
import { requireStaff } from "@/lib/auth/session";
import { branchBase, branchPath, getDb } from "@/lib/tenancy/context";
import { getPaymentView } from "@/lib/payments/service";
import { logoUrl } from "@/lib/settings/service";

export const metadata: Metadata = { title: "Receipt" };

/** 80 mm receipt (or bill, before payment), printed through the browser's print dialog. */
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ print?: string; from?: string }>;
}) {
  const person = await requireStaff("order");
  const [{ orderId }, { print, from }] = await Promise.all([params, searchParams]);
  const view = getPaymentView((await getDb()), person.restaurantId, orderId);
  if (!view) notFound();

  const { order } = view;
  const paid = order.status === "paid";

  return (
    <main className="min-h-dvh bg-ink-950 px-4 py-6 print:bg-white print:p-0">
      <PrintControls autoPrint={print === "1"} backHref={await branchPath(from === "tables" ? "/tables" : paid ? "/order" : `/pay/${order.id}`)} />
      <Receipt view={view} logoSrc={view.logoFile ? logoUrl(await branchBase(), view.logoFile) : null} />
    </main>
  );
}
