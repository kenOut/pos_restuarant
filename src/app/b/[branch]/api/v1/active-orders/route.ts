import { activeOrderJson } from "@/lib/api/data";
import { handleApi, handleApiOptions, json } from "@/lib/api/http";
import { listActiveOrders } from "@/lib/office/reports";

export const dynamic = "force-dynamic";

/** GET /api/v1/active-orders: every order open right now, oldest first, with how far the kitchen has got. */
export const GET = (request: Request) => handleApi(request, ({ db, restaurantId }) => json({ data: listActiveOrders(db, restaurantId).map(activeOrderJson) }));
export const OPTIONS = handleApiOptions;
