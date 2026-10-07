import { API_VERSION } from "../../../../src/openapi/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/health (no key, spec 6.9): { status, version, time }. */
export function GET(): Response {
  return Response.json({ status: "ok", version: API_VERSION, time: new Date().toISOString() });
}
