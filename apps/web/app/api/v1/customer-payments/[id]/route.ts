import { idParams } from "../../../../../src/openapi/registry";
import { endpoint } from "../../../../../src/server/http/pipeline";
import { getPayment } from "../../../../../src/server/services/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/customer-payments/{id} (read, spec 6.5): read back by ID. */
export const GET = endpoint(
  { method: "GET", route: "/api/v1/customer-payments/{id}", scope: "read", params: idParams },
  async ({ tx, params }) => ({ status: 200, body: await getPayment(tx, params.id) }),
);
