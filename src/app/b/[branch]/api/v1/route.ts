import { branchJson } from "@/lib/api/data";
import { handleApi, handleApiOptions, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** GET /api/v1: which branch this key reads, and the API version. */
export const GET = (request: Request) => handleApi(request, ({ db, restaurantId }) => json(branchJson(db, restaurantId)));
export const OPTIONS = handleApiOptions;
