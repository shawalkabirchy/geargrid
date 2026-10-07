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

const json = <T extends z.ZodType>(schema: T) => ({ "application/json": { schema } });

/** The error answers a route can give, each with the shared error schema. */
function errorResponses(...statuses: (400 | 401 | 403 | 404 | 409 | 422)[]) {
  const text = {
    400: "Invalid request",
    401: "No valid key",
    403: "Missing scope",
    404: "Not found",
  } as const;
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      {
        description: status in text ? text[status as keyof typeof text] : "Refused",
        content: json(errorSchema),
      },
    ]),
  );
}

const security = [{ ApiKeyAuth: [] }];

export const idParams = z.object({ id: z.uuid().openapi({ param: { name: "id", in: "path" } }) });

const nullableTaka = z.number().int().nullable();

export const customerSchema = registry.register(
  "Customer",
  z.object({
    id: z.uuid(),
    name: z.string(),
    type: z.string(),
    price_tier: z.enum(["retail", "garage", "wholesale"]),
    phone: z.string().nullable(),
    credit_limit_taka: nullableTaka,
    due_balance_taka: z.number().int(),
  }),
);

export const supplierSchema = registry.register(
  "Supplier",
  z.object({
    id: z.uuid(),
    name: z.string(),
    phone: z.string().nullable(),
    payable_balance_taka: z.number().int(),
  }),
);

export const partSchema = registry.register(
  "Part",
  z.object({
    id: z.uuid(),
    name_en: z.string(),
    name_bn: z.string().nullable(),
    quality: z.string(),
    position: z.string().nullable(),
    unit: z.string(),
    rack_location: z.string().nullable(),
    retail_price_taka: z.number().int(),
    garage_price_taka: nullableTaka,
    wholesale_price_taka: nullableTaka,
    stock_quantity: z.number(),
    is_active: z.boolean(),
  }),
);

export const fitmentSchema = registry.register(
  "Fitment",
  z.object({
    id: z.uuid(),
    part_id: z.uuid(),
    vehicle_id: z.uuid(),
    note: z.string().nullable(),
    source: z.string(),
    verified: z.boolean(),
    deleted: z.boolean(),
    updated_at: z.string(),
  }),
);

for (const [path, operationId, name, schema] of [
  ["/api/v1/customers/{id}", "getCustomer", "customer", customerSchema],
  ["/api/v1/suppliers/{id}", "getSupplier", "supplier", supplierSchema],
  ["/api/v1/parts/{id}", "getPart", "part", partSchema],
  ["/api/v1/fitments/{id}", "getFitment", "fitment", fitmentSchema],
] as const) {
  registry.registerPath({
    method: "get",
    path,
    operationId,
    summary: `Read a ${name} by ID`,
    security,
    request: { params: idParams },
    responses: {
      200: { description: `The ${name}`, content: json(z.object({ [name]: schema })) },
      ...errorResponses(400, 401, 403, 404),
    },
  });
}

/** The OpenAPI 3.1 document served at /api/openapi.json. */
export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "GearGrid API", version: API_VERSION },
    servers: [{ url: "/" }],
  });
}
