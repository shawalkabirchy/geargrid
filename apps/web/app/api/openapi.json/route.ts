import { buildOpenApiDocument } from "../../../src/openapi/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/openapi.json (no key, spec 6.9): the OpenAPI 3.1 document DokaanBondhu imports. */
export function GET(): Response {
  return Response.json(buildOpenApiDocument());
}
