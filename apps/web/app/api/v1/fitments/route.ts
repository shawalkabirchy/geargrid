import { fitmentInput } from "../../../../src/openapi/registry";
import { endpoint } from "../../../../src/server/http/pipeline";
import { addFitment } from "../../../../src/server/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/fitments (fitments:write, spec 6.5): record that a part fits a vehicle. */
export const POST = endpoint(
  { method: "POST", route: "/api/v1/fitments", scope: "fitments:write", body: fitmentInput },
  addFitment,
);
