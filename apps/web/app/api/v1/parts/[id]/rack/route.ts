import { idParams, rackInput } from "../../../../../../src/openapi/registry";
import { endpoint } from "../../../../../../src/server/http/pipeline";
import { updateRack } from "../../../../../../src/server/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/parts/{id}/rack (racks:write, spec 6.5, D195): a new rack or none; the answer keeps the previous one. */
export const PATCH = endpoint(
  {
    method: "PATCH",
    route: "/api/v1/parts/{id}/rack",
    scope: "racks:write",
    params: idParams,
    body: rackInput,
  },
  updateRack,
);
