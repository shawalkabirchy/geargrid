import { supplierInput } from "../../../../src/openapi/registry";
import { endpoint } from "../../../../src/server/http/pipeline";
import { addSupplier } from "../../../../src/server/services/parties";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/suppliers (suppliers:write, spec 6.5, D173): add a new supplier; ?dry_run=true checks it. */
export const POST = endpoint(
  {
    method: "POST",
    route: "/api/v1/suppliers",
    scope: "suppliers:write",
    body: supplierInput,
    dryRun: true,
  },
  addSupplier,
);
