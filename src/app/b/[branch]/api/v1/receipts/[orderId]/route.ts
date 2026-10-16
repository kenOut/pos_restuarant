import { receiptJson } from "@/lib/api/data";
import { apiError, handleApi, handleApiOptions, json } from "@/lib/api/http";
import { receiptHtml } from "@/lib/api/receipt-html";

export const dynamic = "force-dynamic";

/** GET /api/v1/receipts/{orderId}: the receipt (or bill) as data, or ?format=html for the printable page. */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return handleApi(request, ({ db, restaurantId, params: search }) => {
    const receipt = receiptJson(db, restaurantId, orderId);
    if (!receipt) return apiError(404, "not_found", "There's no order with that id at this branch.");
    if (search.get("format") === "html") {
      return new Response(receiptHtml(receipt), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return json({ data: receipt });
  });
}
export const OPTIONS = handleApiOptions;
