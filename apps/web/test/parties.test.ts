import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as addCustomer } from "../app/api/v1/customers/route";
import { GET as getCustomer, PATCH as updateCustomer } from "../app/api/v1/customers/[id]/route";
import { POST as stockIn } from "../app/api/v1/purchases/route";
import { POST as recordSale } from "../app/api/v1/sales/route";
import { POST as addSupplier } from "../app/api/v1/suppliers/route";
import { GET as getSupplier, PATCH as updateSupplier } from "../app/api/v1/suppliers/[id]/route";
import {
  call,
  createTestShop,
  failedChecks,
  fingerprintOf,
  first,
  inCi,
  NO_READ_KEY,
  type TestShop,
} from "./harness";

// New customers and suppliers (spec 6.5, 6.10, D173): a dry run saves nothing, the price tier follows the type, and
// { deleted: true } removes one only while nothing is recorded for it.

describe.skipIf(!inCi)("new customers and suppliers", () => {
  let shop: TestShop;
  let partId = "";

  const errorCode = (answer: { body: Record<string, unknown> }) =>
    (answer.body.error as { code: string }).code;
  const customerBody = { name: "Karim Garage", type: "garage", phone: "01711-223344", address: "Bangshal" };

  beforeAll(async () => {
    shop = await createTestShop("parties");
    partId = (
      await first<{ id: string }>(
        shop,
        "select id from parts where deleted_at is null order by name_en limit 1",
      )
    ).id;
  }, 180_000);

  afterAll(async () => shop?.drop());

  it("adds a customer: the dry run saves nothing, the tier is the type, and it reads back", async () => {
    const before = await fingerprintOf(shop);
    const dry = await call(addCustomer, {
      method: "POST",
      path: "/api/v1/customers?dry_run=true",
      body: customerBody,
    });
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ dry_run: true, warnings: [], customer: { name: "Karim Garage" } });
    expect(await fingerprintOf(shop)).toEqual(before);

    const added = await call(addCustomer, { method: "POST", path: "/api/v1/customers", body: customerBody });
    expect(added.status).toBe(201);
    const customer = added.body.customer as { id: string };
    expect(added.body).toEqual({
      customer: {
        id: customer.id,
        name: "Karim Garage",
        type: "garage",
        price_tier: "garage",
        phone: "01711-223344",
        credit_limit_taka: null,
        due_balance_taka: 0,
      },
      warnings: [],
      dry_run: false,
    });
    expect(await first(shop, "select action from audit_logs where entity_id = $1", [customer.id])).toEqual({
      action: "customer.create",
    });
    expect((await call(getCustomer, { params: { id: customer.id } })).body.customer).toEqual(
      added.body.customer,
    );
  });

  it("refuses a customer without a type, with a phone that is not one, or without customers:write", async () => {
    const post = (body: unknown, key?: string) =>
      call(addCustomer, { method: "POST", path: "/api/v1/customers", body, ...(key ? { key } : {}) });
    expect(errorCode(await post({ name: "Karim Garage" }))).toBe("VALIDATION_FAILED");
    expect(errorCode(await post({ ...customerBody, phone: "call me" }))).toBe("VALIDATION_FAILED");
    expect(errorCode(await post({ ...customerBody, name: " " }))).toBe("VALIDATION_FAILED");
    const forbidden = await post(customerBody, NO_READ_KEY);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toMatchObject({
      code: "FORBIDDEN_SCOPE",
      details: { required: "customers:write" },
    });
  });

  it("removes a customer with nothing recorded, and refuses one that has bought", async () => {
    const added = await call(addCustomer, {
      method: "POST",
      path: "/api/v1/customers",
      body: { name: "Rafiq Auto", type: "retail" },
    });
    const id = (added.body.customer as { id: string }).id;
    const edited = await call(updateCustomer, {
      method: "PATCH",
      params: { id },
      body: { phone: "01811000000" },
    });
    expect(edited.body.customer).toMatchObject({ id, phone: "01811000000", price_tier: "retail" });
    const removed = await call(updateCustomer, { method: "PATCH", params: { id }, body: { deleted: true } });
    expect(removed.status).toBe(200);
    expect((await call(getCustomer, { params: { id } })).status).toBe(404);
    expect(
      errorCode(await call(updateCustomer, { method: "PATCH", params: { id }, body: { deleted: true } })),
    ).toBe("NOT_FOUND");

    const buyer = await call(addCustomer, {
      method: "POST",
      path: "/api/v1/customers",
      body: { name: "Selim Motors", type: "garage" },
    });
    const buyerId = (buyer.body.customer as { id: string }).id;
    const sale = await call(recordSale, {
      method: "POST",
      path: "/api/v1/sales",
      body: { customer_id: buyerId, items: [{ part_id: partId, quantity: 1 }] },
    });
    expect(sale.status).toBe(201);
    const refused = await call(updateCustomer, {
      method: "PATCH",
      params: { id: buyerId },
      body: { deleted: true },
    });
    expect(refused.status).toBe(409);
    expect(errorCode(refused)).toBe("CUSTOMER_IN_USE");
    expect((await call(getCustomer, { params: { id: buyerId } })).status).toBe(200);
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("adds a supplier with a dry run, removes an unused one, and refuses one that has sold to the shop", async () => {
    const before = await fingerprintOf(shop);
    const body = { name: "Dhaka Auto Traders", phone: "+8801911000000" };
    const dry = await call(addSupplier, { method: "POST", path: "/api/v1/suppliers?dry_run=true", body });
    expect(dry.status).toBe(200);
    expect(await fingerprintOf(shop)).toEqual(before);
    const added = await call(addSupplier, { method: "POST", path: "/api/v1/suppliers", body });
    expect(added.status).toBe(201);
    const supplier = added.body.supplier as { id: string };
    expect(added.body).toEqual({
      supplier: {
        id: supplier.id,
        name: "Dhaka Auto Traders",
        phone: "+8801911000000",
        payable_balance_taka: 0,
      },
      warnings: [],
      dry_run: false,
    });
    const removed = await call(updateSupplier, {
      method: "PATCH",
      params: { id: supplier.id },
      body: { deleted: true },
    });
    expect(removed.status).toBe(200);
    expect((await call(getSupplier, { params: { id: supplier.id } })).status).toBe(404);

    const seller = await call(addSupplier, {
      method: "POST",
      path: "/api/v1/suppliers",
      body: { name: "Chawkbazar Parts" },
    });
    const sellerId = (seller.body.supplier as { id: string }).id;
    const bought = await call(stockIn, {
      method: "POST",
      path: "/api/v1/purchases",
      body: { supplier_id: sellerId, items: [{ part_id: partId, quantity: 1, unit_cost_taka: 100 }] },
    });
    expect(bought.status).toBe(201);
    const refused = await call(updateSupplier, {
      method: "PATCH",
      params: { id: sellerId },
      body: { deleted: true },
    });
    expect(refused.status).toBe(409);
    expect(errorCode(refused)).toBe("SUPPLIER_IN_USE");
    expect(await failedChecks(shop)).toEqual([]);
  });
});
