import { listOrdersJson } from "@/lib/api/data";
import { apiError, handleApi, handleApiOptions, json, query } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** GET /api/v1/orders?updated_since=&from=&to=&status=&limit=&cursor= */
export const GET = (request: Request) =>
  handleApi(request, ({ db, restaurantId, params }) => {
    const result = listOrdersJson(db, restaurantId, query(params, ["updated_since", "from", "to", "status", "limit", "cursor"]));
    return result.ok ? json({ data: result.data, next_cursor: result.next_cursor }) : apiError(400, "bad_request", result.error);
  });
export const OPTIONS = handleApiOptions;
