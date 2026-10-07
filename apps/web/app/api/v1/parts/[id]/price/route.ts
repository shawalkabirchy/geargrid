import { idParams, priceInput } from "../../../../../../src/openapi/registry";
import { endpoint } from "../../../../../../src/server/http/pipeline";
import { updatePrice } from "../../../../../../src/server/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/parts/{id}/price (prices:write, spec 6.5): new prices; the answer keeps the previous ones. */
export const PATCH = endpoint(
  {
    method: "PATCH",
    route: "/api/v1/parts/{id}/price",
    scope: "prices:write",
    params: idParams,
    body: priceInput,
  },
  updatePrice,
);
