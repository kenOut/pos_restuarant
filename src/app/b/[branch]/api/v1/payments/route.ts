import { listPaymentsJson } from "@/lib/api/data";
import { apiError, handleApi, handleApiOptions, json, query } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** GET /api/v1/payments?since=&from=&to=&method=&limit=&cursor= */
export const GET = (request: Request) =>
  handleApi(request, ({ db, restaurantId, params }) => {
    const result = listPaymentsJson(db, restaurantId, query(params, ["since", "from", "to", "method", "limit", "cursor"]));
    return result.ok ? json({ data: result.data, next_cursor: result.next_cursor }) : apiError(400, "bad_request", result.error);
  });
export const OPTIONS = handleApiOptions;
