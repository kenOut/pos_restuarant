import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintControls } from "@/components/pay/print-controls";
import { Receipt } from "@/components/pay/receipt";
import { requireOffice } from "@/lib/office/session";
import { getPaymentView } from "@/lib/payments/service";
import { logoUrl } from "@/lib/settings/service";
import { branchBase, branchPath, getDb } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Receipt" };

/** A receipt (or bill) from the back office, to view or reprint. */
export default async function OfficeReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const person = await requireOffice();
  const { orderId } = await params;
  const view = getPaymentView(await getDb(), person.restaurantId, orderId);
  if (!view) notFound();
  return (
    <main className="min-h-dvh bg-ink-950 px-4 py-6 print:bg-white print:p-0">
      <PrintControls autoPrint={false} backHref={await branchPath(`/office/orders/${orderId}`)} />
      <Receipt view={view} logoSrc={view.logoFile ? logoUrl(await branchBase(), view.logoFile) : null} />
    </main>
  );
}
