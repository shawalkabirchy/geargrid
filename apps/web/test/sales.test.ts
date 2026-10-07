import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as recordSale } from "../app/api/v1/sales/route";
import { GET as getSale } from "../app/api/v1/sales/[id]/route";
import { POST as voidSale } from "../app/api/v1/sales/[id]/void/route";
import {
  call,
  createTestShop,
  dueOfCustomer,
  failedChecks,
  fingerprintOf,
  first,
  inCi,
  NO_READ_KEY,
  stockOfPart,
  type TestShop,
} from "./harness";

// Sales (spec 6.5-6.7, 6.10): the postings checked by db:check and directly, a dry run that leaves every business table
// as it was, each error code a sale can give, the warnings, two sales of one part at once, and the void.

describe.skipIf(!inCi)("sales", () => {
  let shop: TestShop;
  const garage = { id: "", due: 0, garagePrice: 0 };
  const part = { id: "", stock: 0, avgCost: 0 };
  let saleId = "";

  const one = <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) =>
    first<T>(shop, sql, values);
  const stockOf = (id: string) => stockOfPart(shop, id);
  const dueOf = (id: string) => dueOfCustomer(shop, id);
  const checks = () => failedChecks(shop);
  const fingerprint = () => fingerprintOf(shop);

  beforeAll(async () => {
    shop = await createTestShop("sales");
    const customer = await one<{ id: string; due_balance: string }>(
      "select id, due_balance from customers where price_tier = 'garage' and deleted_at is null order by name limit 1",
    );
    garage.id = customer.id;
    garage.due = Number(customer.due_balance);
    const row = await one<{ id: string; quantity: string; avg_cost: string; garage_price: string }>(
      `select p.id, l.quantity, p.avg_cost, p.garage_price from parts p join stock_levels l on l.part_id = p.id
       where p.garage_price is not null and l.quantity >= 10 and p.is_active and p.deleted_at is null
       order by p.name_en limit 1`,
    );
    part.id = row.id;
    part.stock = Number(row.quantity);
    part.avgCost = Number(row.avg_cost);
    garage.garagePrice = Number(row.garage_price);
  }, 180_000);

  afterAll(async () => shop?.drop());

  const sale = (
    body: unknown,
    options: { key?: string; headers?: Record<string, string>; dry?: boolean } = {},
  ) =>
    call(recordSale, {
      method: "POST",
      path: `/api/v1/sales${options.dry ? "?dry_run=true" : ""}`,
      body,
      ...(options.key ? { key: options.key } : {}),
      headers: options.headers ?? {},
    });

  it("checks a credit sale in a dry run without changing any business table or using an invoice number", async () => {
    const before = await fingerprint();
    const dry = await sale(
      { customer_id: garage.id, items: [{ part_id: part.id, quantity: 2 }] },
      { dry: true },
    );
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({
      dry_run: true,
      sale: { invoice_no: null, total_taka: garage.garagePrice * 2, due_taka: garage.garagePrice * 2 },
      customer: { id: garage.id, due_balance_taka: garage.due + garage.garagePrice * 2 },
    });
    expect(await fingerprint()).toEqual(before);
  });

  it("records a credit sale at the customer's own price, with every posting, and reads it back", async () => {
    const answer = await sale(
      { customer_id: garage.id, items: [{ part_id: part.id, quantity: 2 }] },
      { headers: { "idempotency-key": "sale-credit-0001", "x-acting-user": "Karim" } },
    );
    expect(answer.status).toBe(201);
    const body = answer.body as { sale: Record<string, unknown> & { id: string }; warnings: unknown[] };
    saleId = body.sale.id;
    expect(body.sale).toMatchObject({
      invoice_no: "A-000001",
      customer_id: garage.id,
      total_taka: garage.garagePrice * 2,
      paid_taka: 0,
      due_taka: garage.garagePrice * 2,
      status: "completed",
      items: [{ part_id: part.id, quantity: 2, unit_price_taka: garage.garagePrice, price_tier: "garage" }],
    });
    expect(body.warnings).toEqual([]);
    expect(answer.body.customer).toEqual({
      id: garage.id,
      due_balance_taka: garage.due + garage.garagePrice * 2,
    });
    expect(await stockOf(part.id)).toBe(part.stock - 2);
    expect(await dueOf(garage.id)).toBe(garage.due + garage.garagePrice * 2);
    const ledger = await one<{ entry_type: string; debit: string; balance_after: string }>(
      "select entry_type, debit, balance_after from customer_ledger where ref_id = $1",
      [saleId],
    );
    expect(ledger).toMatchObject({ entry_type: "sale", debit: String(garage.garagePrice * 2) });
    const movement = await one<{ qty_change: string; unit_cost: string }>(
      "select qty_change, unit_cost from stock_movements where ref_id = $1",
      [saleId],
    );
    expect(movement).toEqual({ qty_change: "-2.000", unit_cost: String(part.avgCost) });
    expect(
      await one("select source, acting_user, action from audit_logs where entity_id = $1", [saleId]),
    ).toEqual({
      source: "ai",
      acting_user: "Karim",
      action: "sale.create",
    });
    expect(await checks()).toEqual([]);
    expect((await call(getSale, { params: { id: saleId } })).body.sale).toEqual(body.sale);
  });

  it("takes a walk-in cash sale into the bKash account, warning when the TrxID is missing", async () => {
    const price = Number(
      (await one<{ retail_price: string }>("select retail_price from parts where id = $1", [part.id]))
        .retail_price,
    );
    const answer = await sale({
      items: [{ part_id: part.id, quantity: 1 }],
      payments: [{ method: "bkash", amount_taka: price }],
    });
    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({
      customer: null,
      sale: { due_taka: 0, paid_taka: price, flags: ["TRX_ID_MISSING"] },
      warnings: [{ code: "TRX_ID_MISSING", message_bn: expect.stringMatching(/ট্রানজেকশন/) }],
    });
    const id = (answer.body.sale as { id: string }).id;
    expect(await one("select direction, amount from account_transactions where ref_id = $1", [id])).toEqual({
      direction: "in",
      amount: String(price),
    });
    expect(await checks()).toEqual([]);
  });

  it("refuses what a sale may not be, with the code and nothing written", async () => {
    const before = await fingerprint();
    const item = { part_id: part.id, quantity: 1 };
    const cases: [unknown, string, string?][] = [
      [{ items: [{ part_id: "0192e011-2a4c-7f3e-b5d1-9c8a7e6f5d40", quantity: 1 }] }, "PART_NOT_AVAILABLE"],
      [{ items: [item] }, "WALK_IN_CANNOT_HAVE_DUE"],
      [
        { customer_id: garage.id, items: [item], payments: [{ method: "cash", amount_taka: 9_999_999 }] },
        "PAYMENTS_EXCEED_TOTAL",
      ],
      [
        { customer_id: garage.id, items: [item], discount: { kind: "percent", value: 101 } },
        "DISCOUNT_TOO_HIGH",
      ],
      [
        { customer_id: garage.id, items: [item], discount: { kind: "amount", value: 9_999_999 } },
        "DISCOUNT_TOO_HIGH",
      ],
      [
        { customer_id: garage.id, items: [item], payments: [{ method: "cheque", amount_taka: 1 }] },
        "CHEQUE_DETAILS_REQUIRED",
      ],
      [{ customer_id: "0192e011-2a4c-7f3e-b5d1-9c8a7e6f5d40", items: [item] }, "NOT_FOUND"],
      [{ customer_id: garage.id, items: [{ part_id: part.id, quantity: 0.0005 }] }, "VALIDATION_FAILED"],
      [
        { customer_id: garage.id, items: [{ ...item, unit_price_taka: 1 }] },
        "CUSTOM_PRICE_FORBIDDEN",
        NO_READ_KEY,
      ],
    ];
    for (const [body, code, key] of cases) {
      const answer = await sale(body, key ? { key } : {});
      expect({ code: (answer.body.error as { code: string }).code, status: answer.status }).toMatchObject({
        code,
      });
      expect(answer.status).toBeGreaterThanOrEqual(400);
    }
    const cash = await one<{ id: string }>(
      "select id from accounts where kind = 'cash' order by name limit 1",
    );
    const wrongAccount = await sale({
      customer_id: garage.id,
      items: [item],
      payments: [{ method: "bkash", amount_taka: 1, account_id: cash.id, trx_id: "X1" }],
    });
    expect((wrongAccount.body.error as { code: string }).code).toBe("ACCOUNT_INVALID");
    expect(await fingerprint()).toEqual(before);
  });

  it("asks which account when the method has two, and warns of low stock and a passed credit limit", async () => {
    await shop.admin.query(
      `insert into accounts (id, name, kind, opening_balance) values (gen_random_uuid(), 'Second bKash', 'bkash', 0)`,
    );
    const twoAccounts = await sale({
      customer_id: garage.id,
      items: [{ part_id: part.id, quantity: 1 }],
      payments: [{ method: "bkash", amount_taka: 1, trx_id: "X2" }],
    });
    expect((twoAccounts.body.error as { code: string }).code).toBe("ACCOUNT_REQUIRED");

    await shop.admin.query("update customers set credit_limit = due_balance where id = $1", [garage.id]);
    const big = await sale({
      customer_id: garage.id,
      items: [{ part_id: part.id, quantity: part.stock + 5 }],
    });
    expect(big.status).toBe(201);
    expect((big.body.warnings as { code: string }[]).map((item) => item.code).sort()).toEqual([
      "LOW_STOCK",
      "OVER_CREDIT_LIMIT",
    ]);
    expect(await stockOf(part.id)).toBeLessThan(0); // a sale is never refused for stock
    expect(await checks()).toEqual([]);
  });

  it("takes two sales of the same part sent at the same time, and stock falls by both", async () => {
    const before = await stockOf(part.id);
    const answers = await Promise.all(
      [1, 2].map(() => sale({ customer_id: garage.id, items: [{ part_id: part.id, quantity: 1 }] })),
    );
    expect(answers.map((answer) => answer.status)).toEqual([201, 201]);
    expect(await stockOf(part.id)).toBe(before - 2);
    expect(await checks()).toEqual([]);
  });

  it("voids the credit sale: stock, ledger and due go back; a second void is refused", async () => {
    const stockBefore = await stockOf(part.id);
    const dueBefore = await dueOf(garage.id);
    const voided = await call(voidSale, {
      method: "POST",
      params: { id: saleId },
      body: { reason: "Undo in DokaanBondhu" },
    });
    expect(voided.status).toBe(200);
    expect(voided.body.sale).toMatchObject({
      id: saleId,
      status: "void",
      void_reason: "Undo in DokaanBondhu",
    });
    expect(await stockOf(part.id)).toBe(stockBefore + 2);
    expect(await dueOf(garage.id)).toBe(dueBefore - garage.garagePrice * 2);
    expect(await checks()).toEqual([]);
    const again = await call(voidSale, { method: "POST", params: { id: saleId }, body: { reason: "again" } });
    expect(again.status).toBe(409);
    expect((again.body.error as { code: string }).code).toBe("SALE_ALREADY_VOID");
  });
});
