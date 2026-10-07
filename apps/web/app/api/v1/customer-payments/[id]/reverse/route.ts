import { idParams, reasonInput } from "../../../../../../src/openapi/registry";
import { endpoint } from "../../../../../../src/server/http/pipeline";
import { reversePayment } from "../../../../../../src/server/services/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/customer-payments/{id}/reverse (payments:write, spec 6.5): the due and the money go back. */
export const POST = endpoint(
  {
    method: "POST",
    route: "/api/v1/customer-payments/{id}/reverse",
    scope: "payments:write",
    params: idParams,
    body: reasonInput,
  },
  reversePayment,
);
