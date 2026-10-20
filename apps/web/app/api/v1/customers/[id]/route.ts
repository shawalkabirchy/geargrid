import { idParams, partyChange } from "../../../../../src/openapi/registry";
import { endpoint } from "../../../../../src/server/http/pipeline";
import { updateCustomer } from "../../../../../src/server/services/parties";
import { getCustomer } from "../../../../../src/server/services/reads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/customers/{id} (scope read, spec 6.5): read back by ID; a soft-deleted row is 404. */
export const GET = endpoint(
  { method: "GET", route: "/api/v1/customers/{id}", scope: "read", params: idParams },
  async ({ tx, params }) => ({ status: 200, body: await getCustomer(tx, params.id) }),
);

/** PATCH /api/v1/customers/{id} (customers:write, D173): edit a customer, or remove an unused one with { deleted: true }. */
export const PATCH = endpoint(
  {
    method: "PATCH",
    route: "/api/v1/customers/{id}",
    scope: "customers:write",
    params: idParams,
    body: partyChange,
  },
  updateCustomer,
);
