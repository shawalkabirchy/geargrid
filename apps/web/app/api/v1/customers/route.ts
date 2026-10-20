import { customerInput } from "../../../../src/openapi/registry";
import { endpoint } from "../../../../src/server/http/pipeline";
import { addCustomer } from "../../../../src/server/services/parties";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/customers (customers:write, spec 6.5, D173): add a new customer; ?dry_run=true checks it. */
export const POST = endpoint(
  {
    method: "POST",
    route: "/api/v1/customers",
    scope: "customers:write",
    body: customerInput,
    dryRun: true,
  },
  addCustomer,
);
