import { idParams } from "../../../../../src/openapi/registry";
import { endpoint } from "../../../../../src/server/http/pipeline";
import { getSale } from "../../../../../src/server/services/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/sales/{id} (read, spec 6.5): read back by ID. */
export const GET = endpoint(
  { method: "GET", route: "/api/v1/sales/{id}", scope: "read", params: idParams },
  async ({ tx, params }) => ({ status: 200, body: await getSale(tx, params.id) }),
);
