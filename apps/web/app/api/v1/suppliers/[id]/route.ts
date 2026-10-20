import { idParams, partyChange } from "../../../../../src/openapi/registry";
import { endpoint } from "../../../../../src/server/http/pipeline";
import { updateSupplier } from "../../../../../src/server/services/parties";
import { getSupplier } from "../../../../../src/server/services/reads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/suppliers/{id} (scope read, spec 6.5): read back by ID; a soft-deleted row is 404. */
export const GET = endpoint(
  { method: "GET", route: "/api/v1/suppliers/{id}", scope: "read", params: idParams },
  async ({ tx, params }) => ({ status: 200, body: await getSupplier(tx, params.id) }),
);

/** PATCH /api/v1/suppliers/{id} (suppliers:write, D173): edit a supplier, or remove an unused one with { deleted: true }. */
export const PATCH = endpoint(
  {
    method: "PATCH",
    route: "/api/v1/suppliers/{id}",
    scope: "suppliers:write",
    params: idParams,
    body: partyChange,
  },
  updateSupplier,
);
