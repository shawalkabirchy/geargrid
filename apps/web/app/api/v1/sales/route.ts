import { saleInput } from "../../../../src/openapi/registry";
import { endpoint } from "../../../../src/server/http/pipeline";
import { createSale } from "../../../../src/server/services/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/sales (sales:write, spec 6.5): record a sale; ?dry_run=true computes it without saving. */
export const POST = endpoint(
  { method: "POST", route: "/api/v1/sales", scope: "sales:write", body: saleInput, dryRun: true },
  createSale,
);
