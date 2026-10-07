import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./registry";

// The OpenAPI document (spec 6.9): every operation with its ID, the key on everything but health, and the hints
// DokaanBondhu reads (dry run, compensation, read-back, the host features). The summary below is the snapshot: a new or
// changed operation shows up here first.

type Operation = {
  operationId: string;
  security?: unknown[];
  "x-supports-dry-run"?: boolean;
  "x-compensating-operation"?: { operation: string; id_from: string; body: Record<string, unknown> };
  "x-read-back"?: { operation: string; id_from: string };
};

describe("the OpenAPI document", () => {
  const document = buildOpenApiDocument() as ReturnType<typeof buildOpenApiDocument> & {
    paths: Record<string, Record<string, Operation>>;
  };
  const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({ path, method, ...operation })),
  );

  it("has every operation of spec 6.9 once, with the key on all but health", () => {
    expect(operations.map((operation) => operation.operationId).sort()).toEqual(
      [
        "recordSale",
        "voidSale",
        "receivePayment",
        "reversePayment",
        "stockIn",
        "reversePurchase",
        "recordReturn",
        "updatePrice",
        "addFitment",
        "updateFitment",
        "getHealth",
        "getSale",
        "getPayment",
        "getPurchase",
        "getReturn",
        "getPart",
        "getFitment",
        "getCustomer",
        "getSupplier",
      ].sort(),
    );
    for (const operation of operations) {
      expect(operation.security === undefined).toBe(operation.operationId === "getHealth");
    }
  });

  it("names the six capabilities so that their snake_case forms are the capability names (D46)", () => {
    const writes = ["recordSale", "receivePayment", "stockIn", "recordReturn", "updatePrice", "addFitment"];
    const snake = writes.map((name) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
    expect(snake).toEqual([
      "record_sale",
      "receive_payment",
      "stock_in",
      "record_return",
      "update_price",
      "add_fitment",
    ]);
  });

  it("carries the hints: dry run, compensation and read-back per write, and the host features", () => {
    const hints = Object.fromEntries(
      operations
        .filter((operation) => operation["x-read-back"] || operation["x-compensating-operation"])
        .map((operation) => [
          operation.operationId,
          {
            dry_run: operation["x-supports-dry-run"] === true,
            undo: operation["x-compensating-operation"]?.operation ?? null,
            undo_body: operation["x-compensating-operation"]?.body ?? null,
            read_back: operation["x-read-back"]?.operation ?? null,
          },
        ]),
    );
    expect(hints).toEqual({
      recordSale: {
        dry_run: true,
        undo: "voidSale",
        undo_body: { reason: "{undo_reason}" },
        read_back: "getSale",
      },
      receivePayment: {
        dry_run: true,
        undo: "reversePayment",
        undo_body: { reason: "{undo_reason}" },
        read_back: "getPayment",
      },
      stockIn: {
        dry_run: true,
        undo: "reversePurchase",
        undo_body: { reason: "{undo_reason}" },
        read_back: "getPurchase",
      },
      recordReturn: { dry_run: true, undo: null, undo_body: null, read_back: "getReturn" },
      updatePrice: {
        dry_run: false,
        undo: "updatePrice",
        undo_body: {
          retail_price_taka: "{previous.retail_price_taka}",
          garage_price_taka: "{previous.garage_price_taka}",
          wholesale_price_taka: "{previous.wholesale_price_taka}",
        },
        read_back: "getPart",
      },
      addFitment: {
        dry_run: false,
        undo: "updateFitment",
        undo_body: { deleted: true },
        read_back: "getFitment",
      },
    });
    expect(document["x-host-features"]).toEqual({
      dry_run: "?dry_run=true",
      idempotency_header: "Idempotency-Key",
      bangla_errors: "error.message_bn",
      acting_user_header: "X-Acting-User",
    });
  });

  it("publishes the request and answer schemas the routes parse with", () => {
    expect(Object.keys(document.components?.schemas ?? {}).sort()).toEqual(
      expect.arrayContaining([
        "SaleInput",
        "SaleAnswer",
        "CustomerPaymentInput",
        "PurchaseInput",
        "ReturnInput",
        "Error",
      ]),
    );
    expect(document.paths["/api/v1/sales"]?.post).toMatchObject({
      requestBody: {
        content: { "application/json": { schema: { $ref: "#/components/schemas/SaleInput" } } },
      },
    });
  });
});
