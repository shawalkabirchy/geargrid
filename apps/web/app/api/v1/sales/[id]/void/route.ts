import { idParams, reasonInput } from "../../../../../../src/openapi/registry";
import { endpoint } from "../../../../../../src/server/http/pipeline";
import { voidSale } from "../../../../../../src/server/services/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/sales/{id}/void (sales:write, spec 6.5): cancel a sale; its stock, ledger and money go back. */
export const POST = endpoint(
  {
    method: "POST",
    route: "/api/v1/sales/{id}/void",
    scope: "sales:write",
    params: idParams,
    body: reasonInput,
  },
  voidSale,
);
