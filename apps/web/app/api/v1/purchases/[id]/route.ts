import { idParams } from "../../../../../src/openapi/registry";
import { endpoint } from "../../../../../src/server/http/pipeline";
import { getPurchase } from "../../../../../src/server/services/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/purchases/{id} (read, spec 6.5): read back by ID. */
export const GET = endpoint(
  { method: "GET", route: "/api/v1/purchases/{id}", scope: "read", params: idParams },
  async ({ tx, params }) => ({ status: 200, body: await getPurchase(tx, params.id) }),
);
