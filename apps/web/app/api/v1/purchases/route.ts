import { purchaseInput } from "../../../../src/openapi/registry";
import { endpoint } from "../../../../src/server/http/pipeline";
import { stockIn } from "../../../../src/server/services/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/purchases (purchases:write, spec 6.5): stock in from a supplier; ?dry_run=true checks it. */
export const POST = endpoint(
  { method: "POST", route: "/api/v1/purchases", scope: "purchases:write", body: purchaseInput, dryRun: true },
  stockIn,
);
