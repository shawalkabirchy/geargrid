import { returnInput } from "../../../../src/openapi/registry";
import { endpoint } from "../../../../src/server/http/pipeline";
import { recordReturn } from "../../../../src/server/services/returns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/returns (returns:write, spec 6.5): a return against a sale; ?dry_run=true may leave the refund out. */
export const POST = endpoint(
  { method: "POST", route: "/api/v1/returns", scope: "returns:write", body: returnInput, dryRun: true },
  recordReturn,
);
