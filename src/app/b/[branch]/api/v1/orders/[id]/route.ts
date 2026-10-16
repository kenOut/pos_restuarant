import { orderJson } from "@/lib/api/data";
import { apiError, handleApi, handleApiOptions, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** GET /api/v1/orders/{id}: one order with its lines, taxes and payments. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(request, ({ db, restaurantId }) => {
    const order = orderJson(db, restaurantId, id);
    return order ? json({ data: order }) : apiError(404, "not_found", "There's no order with that id at this branch.");
  });
}
export const OPTIONS = handleApiOptions;
