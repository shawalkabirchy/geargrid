import { fitmentChange, idParams } from "../../../../../src/openapi/registry";
import { endpoint } from "../../../../../src/server/http/pipeline";
import { updateFitment } from "../../../../../src/server/services/catalog";
import { getFitment } from "../../../../../src/server/services/reads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/fitments/{id} (scope read, spec 6.5): read back by ID; a soft-deleted row is 404. */
export const GET = endpoint(
  { method: "GET", route: "/api/v1/fitments/{id}", scope: "read", params: idParams },
  async ({ tx, params }) => ({ status: 200, body: await getFitment(tx, params.id) }),
);

/** PATCH /api/v1/fitments/{id} (fitments:write, spec 6.5): edit a link, or remove it with { deleted: true }. */
export const PATCH = endpoint(
  {
    method: "PATCH",
    route: "/api/v1/fitments/{id}",
    scope: "fitments:write",
    params: idParams,
    body: fitmentChange,
  },
  updateFitment,
);
