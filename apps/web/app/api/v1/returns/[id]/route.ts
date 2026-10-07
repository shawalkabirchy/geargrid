import { idParams } from "../../../../../src/openapi/registry";
import { endpoint } from "../../../../../src/server/http/pipeline";
import { getReturn } from "../../../../../src/server/services/returns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/returns/{id} (read, spec 6.5): read back by ID. */
export const GET = endpoint(
  { method: "GET", route: "/api/v1/returns/{id}", scope: "read", params: idParams },
  async ({ tx, params }) => ({ status: 200, body: await getReturn(tx, params.id) }),
);
