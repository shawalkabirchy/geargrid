import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import packageJson from "../../package.json";

// Every schema and path of the API, registered once (spec 6.9). Route handlers parse with these same schemas, so the
// published document is what the API accepts. Day one of slice B: the error shape and GET /api/v1/health.

extendZodWithOpenApi(z);

export const API_VERSION = packageJson.version;

export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "X-Api-Key",
});

/** The nested error shape of every refusal (spec 6.3): stable code, both languages, the message key, details. */
export const errorSchema = registry.register(
  "Error",
  z.object({
    error: z.object({
      code: z.string(),
      message_en: z.string(),
      message_bn: z.string(),
      message_bn_key: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
);

export const healthSchema = registry.register(
  "Health",
  z.object({ status: z.literal("ok"), version: z.string(), time: z.string() }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/health",
  operationId: "getHealth",
  summary: "Whether the API is up; needs no key",
  responses: {
    200: { description: "The API is up", content: { "application/json": { schema: healthSchema } } },
  },
});

/** The OpenAPI 3.1 document served at /api/openapi.json. */
export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "GearGrid API", version: API_VERSION },
    servers: [{ url: "/" }],
  });
}
