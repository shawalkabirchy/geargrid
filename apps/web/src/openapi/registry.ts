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

// ---- Writes (spec 6.5). Money is whole taka (D92); quantities have at most three decimals.

const quantity = z
  .number()
  .positive()
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, "at most three decimals");
const takaAmount = z.number().int().positive();
const time = z.iso.datetime({ offset: true });
const reasonBody = registry.register("Reason", z.object({ reason: z.string().trim().min(1).max(200) }));

export const paymentInput = registry.register(
  "PaymentInput",
  z.object({
    method: z.enum(["cash", "bkash", "nagad", "rocket", "bank", "cheque"]),
    amount_taka: takaAmount,
    account_id: z.uuid().optional(),
    trx_id: z.string().trim().min(1).max(64).optional(),
    cheque: z
      .object({ bank: z.string().trim().min(1), cheque_no: z.string().trim().min(1), due_date: z.iso.date() })
      .optional(),
  }),
);

export const saleInput = registry.register(
  "SaleInput",
  z.object({
    customer_id: z.uuid().nullable().optional(),
    sale_time: time.optional(),
    items: z
      .array(
        z.object({ part_id: z.uuid(), quantity, unit_price_taka: z.number().int().nonnegative().optional() }),
      )
      .min(1),
    discount: z.object({ kind: z.enum(["amount", "percent"]), value: z.number().nonnegative() }).optional(),
    payments: z.array(paymentInput).default([]),
    note: z.string().max(500).optional(),
  }),
);

const warningSchema = registry.register(
  "Warning",
  z.object({
    code: z.enum(["LOW_STOCK", "OVER_CREDIT_LIMIT", "INACTIVE_PART", "TRX_ID_MISSING", "AVG_COST_KEPT"]),
    message_en: z.string(),
    message_bn: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
);

const customerBalance = z.object({ id: z.uuid(), due_balance_taka: z.number().int() }).nullable();

const saleSchema = registry.register(
  "Sale",
  z.object({
    id: z.uuid(),
    invoice_no: z.string().nullable(),
    customer_id: z.uuid().nullable(),
    sale_time: z.string(),
    subtotal_taka: z.number().int(),
    discount_taka: z.number().int(),
    round_off_taka: z.number().int(),
    total_taka: z.number().int(),
    paid_taka: z.number().int(),
    due_taka: z.number().int(),
    status: z.enum(["completed", "void"]),
    void_reason: z.string().nullable(),
    flags: z.array(z.string()),
    note: z.string().nullable(),
    items: z.array(
      z.object({
        id: z.uuid(),
        part_id: z.uuid(),
        quantity: z.number(),
        unit_price_taka: z.number().int(),
        list_price_taka: z.number().int(),
        price_tier: z.string(),
        line_total_taka: z.number().int(),
      }),
    ),
    payments: z.array(
      z.object({
        id: z.uuid(),
        method: z.string(),
        amount_taka: z.number().int(),
        account_id: z.uuid().nullable(),
        trx_id: z.string().nullable(),
        cheque_id: z.uuid().nullable(),
      }),
    ),
  }),
);

const saleAnswer = registry.register(
  "SaleAnswer",
  z.object({
    sale: saleSchema,
    customer: customerBalance,
    warnings: z.array(warningSchema),
    dry_run: z.boolean(),
  }),
);

const idempotencyHeader = z.object({
  "Idempotency-Key": z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,100}$/)
    .optional(),
  "X-Acting-User": z.string().min(1).max(100).optional(),
});
const dryRunQuery = z.object({ dry_run: z.enum(["true", "false"]).optional() });

registry.registerPath({
  method: "post",
  path: "/api/v1/sales",
  operationId: "recordSale",
  summary: "Record a sale, on credit or paid; ?dry_run=true checks it and computes the totals without saving",
  security,
  request: { query: dryRunQuery, headers: idempotencyHeader, body: { content: json(saleInput) } },
  responses: {
    201: { description: "The sale was saved", content: json(saleAnswer) },
    200: { description: "Dry run: what the sale would be", content: json(saleAnswer) },
    ...errorResponses(400, 401, 403, 404, 422),
  },
  "x-supports-dry-run": true,
  "x-compensating-operation": {
    operation: "voidSale",
    id_from: "sale.id",
    body: { reason: "{undo_reason}" },
  },
  "x-read-back": { operation: "getSale", id_from: "sale.id" },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/sales/{id}/void",
  operationId: "voidSale",
  summary: "Cancel a sale: stock, ledger and money go back",
  security,
  request: { params: idParams, headers: idempotencyHeader, body: { content: json(reasonBody) } },
  responses: {
    200: { description: "The cancelled sale", content: json(saleAnswer) },
    ...errorResponses(400, 401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/sales/{id}",
  operationId: "getSale",
  summary: "Read a sale by ID",
  security,
  request: { params: idParams },
  responses: {
    200: { description: "The sale", content: json(z.object({ sale: saleSchema })) },
    ...errorResponses(400, 401, 403, 404),
  },
});

export const reasonInput = reasonBody;

export const customerPaymentInput = registry.register(
  "CustomerPaymentInput",
  paymentInput.extend({ customer_id: z.uuid(), received_at: time.optional() }),
);

const customerPaymentSchema = registry.register(
  "CustomerPayment",
  z.object({
    id: z.uuid(),
    customer_id: z.uuid(),
    amount_taka: z.number().int(),
    method: z.string(),
    account_id: z.uuid().nullable(),
    trx_id: z.string().nullable(),
    cheque_id: z.uuid().nullable(),
    received_at: z.string(),
    status: z.enum(["completed", "reversed"]),
    reversal_reason: z.string().nullable(),
  }),
);

const paymentAnswer = registry.register(
  "CustomerPaymentAnswer",
  z.object({
    payment: customerPaymentSchema,
    customer: customerBalance,
    warnings: z.array(warningSchema),
    dry_run: z.boolean(),
  }),
);

registry.registerPath({
  method: "post",
  path: "/api/v1/customer-payments",
  operationId: "receivePayment",
  summary: "Receive a payment from a customer against their due; ?dry_run=true checks it without saving",
  security,
  request: { query: dryRunQuery, headers: idempotencyHeader, body: { content: json(customerPaymentInput) } },
  responses: {
    201: { description: "The payment was saved", content: json(paymentAnswer) },
    200: { description: "Dry run: what the payment would be", content: json(paymentAnswer) },
    ...errorResponses(400, 401, 403, 404, 422),
  },
  "x-supports-dry-run": true,
  "x-compensating-operation": {
    operation: "reversePayment",
    id_from: "payment.id",
    body: { reason: "{undo_reason}" },
  },
  "x-read-back": { operation: "getPayment", id_from: "payment.id" },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/customer-payments/{id}/reverse",
  operationId: "reversePayment",
  summary: "Reverse a customer payment: the due and the money go back",
  security,
  request: { params: idParams, headers: idempotencyHeader, body: { content: json(reasonBody) } },
  responses: {
    200: { description: "The reversed payment", content: json(paymentAnswer) },
    ...errorResponses(400, 401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/customer-payments/{id}",
  operationId: "getPayment",
  summary: "Read a customer payment by ID",
  security,
  request: { params: idParams },
  responses: {
    200: { description: "The payment", content: json(z.object({ payment: customerPaymentSchema })) },
    ...errorResponses(400, 401, 403, 404),
  },
});

export const purchaseInput = registry.register(
  "PurchaseInput",
  z.object({
    supplier_id: z.uuid(),
    bill_no: z.string().trim().min(1).max(64).optional(),
    purchase_time: time.optional(),
    items: z
      .array(z.object({ part_id: z.uuid(), quantity, unit_cost_taka: z.number().int().nonnegative() }))
      .min(1),
    payments: z.array(paymentInput).default([]),
  }),
);

const purchaseSchema = registry.register(
  "Purchase",
  z.object({
    id: z.uuid(),
    supplier_id: z.uuid(),
    bill_no: z.string().nullable(),
    purchase_time: z.string(),
    total_taka: z.number().int(),
    paid_taka: z.number().int(),
    due_taka: z.number().int(),
    status: z.enum(["completed", "reversed"]),
    reversal_reason: z.string().nullable(),
    items: z.array(
      z.object({
        id: z.uuid(),
        part_id: z.uuid(),
        quantity: z.number(),
        unit_cost_taka: z.number().int(),
        line_total_taka: z.number().int(),
      }),
    ),
    payments: z.array(
      z.object({
        id: z.uuid(),
        method: z.string(),
        amount_taka: z.number().int(),
        account_id: z.uuid().nullable(),
        trx_id: z.string().nullable(),
        cheque_id: z.uuid().nullable(),
      }),
    ),
  }),
);

const purchaseAnswer = registry.register(
  "PurchaseAnswer",
  z.object({
    purchase: purchaseSchema,
    supplier: z.object({ id: z.uuid(), payable_balance_taka: z.number().int() }),
    warnings: z.array(warningSchema),
    dry_run: z.boolean(),
  }),
);

registry.registerPath({
  method: "post",
  path: "/api/v1/purchases",
  operationId: "stockIn",
  summary: "Record a purchase from a supplier (stock in); ?dry_run=true checks it without saving",
  security,
  request: { query: dryRunQuery, headers: idempotencyHeader, body: { content: json(purchaseInput) } },
  responses: {
    201: { description: "The purchase was saved", content: json(purchaseAnswer) },
    200: { description: "Dry run: what the purchase would be", content: json(purchaseAnswer) },
    ...errorResponses(400, 401, 403, 404, 422),
  },
  "x-supports-dry-run": true,
  "x-compensating-operation": {
    operation: "reversePurchase",
    id_from: "purchase.id",
    body: { reason: "{undo_reason}" },
  },
  "x-read-back": { operation: "getPurchase", id_from: "purchase.id" },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/purchases/{id}/reverse",
  operationId: "reversePurchase",
  summary: "Reverse a purchase: stock, payable and money go back",
  security,
  request: { params: idParams, headers: idempotencyHeader, body: { content: json(reasonBody) } },
  responses: {
    200: { description: "The reversed purchase", content: json(purchaseAnswer) },
    ...errorResponses(400, 401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/purchases/{id}",
  operationId: "getPurchase",
  summary: "Read a purchase by ID",
  security,
  request: { params: idParams },
  responses: {
    200: { description: "The purchase", content: json(z.object({ purchase: purchaseSchema })) },
    ...errorResponses(400, 401, 403, 404),
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
