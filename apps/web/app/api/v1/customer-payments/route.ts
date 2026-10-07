import { customerPaymentInput } from "../../../../src/openapi/registry";
import { endpoint } from "../../../../src/server/http/pipeline";
import { receivePayment } from "../../../../src/server/services/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/customer-payments (payments:write, spec 6.5): receive a payment; ?dry_run=true checks it. */
export const POST = endpoint(
  {
    method: "POST",
    route: "/api/v1/customer-payments",
    scope: "payments:write",
    body: customerPaymentInput,
    dryRun: true,
  },
  receivePayment,
);
