import { summaryJson } from "@/lib/api/data";
import { handleApi, handleApiOptions, json } from "@/lib/api/http";
import { getSummary, resolveRange } from "@/lib/office/reports";

export const dynamic = "force-dynamic";

/** GET /api/v1/summary?period=today|yesterday|week|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD: the dashboard totals. */
export const GET = (request: Request) =>
  handleApi(request, ({ db, restaurantId, params }) => {
    const range = resolveRange(params.get("period") ?? undefined, params.get("from"), params.get("to"));
    return json({ data: { period: range.period, ...summaryJson(getSummary(db, restaurantId, range), range) } });
  });
export const OPTIONS = handleApiOptions;
