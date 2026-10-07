import { idParams, reasonInput } from "../../../../../../src/openapi/registry";
import { endpoint } from "../../../../../../src/server/http/pipeline";
import { reversePurchase } from "../../../../../../src/server/services/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/purchases/{id}/reverse (purchases:write, spec 6.5): stock, payable and money go back (D93). */
export const POST = endpoint(
  {
    method: "POST",
    route: "/api/v1/purchases/{id}/reverse",
    scope: "purchases:write",
    params: idParams,
    body: reasonInput,
  },
  reversePurchase,
);
