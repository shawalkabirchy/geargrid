import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database, type Tx } from "../src/server/db";
import type { Answer } from "../src/server/http/pipeline";
import type { AuditActor } from "../src/server/posting";
import { receivePayment, reversePayment } from "../src/server/services/payments";
import { reversePurchase, stockIn } from "../src/server/services/purchases";
import { recordReturn } from "../src/server/services/returns";
import { createSale, voidSale } from "../src/server/services/sales";
import {
  customerPaymentList,
  listPurchases,
  listSales,
  purchaseDetail,
  saleDetail,
} from "../src/server/services/trade-reads";
import {
  createTestShop,
  dueOfCustomer,
  failedChecks,
  first,
  inCi,
  stockOfPart,
  type TestShop,
} from "./harness";

// Selling and buying on the web dashboard (DokaanBondhu spec D193, C3): the API's own services run as the logged-in
// owner. A web sale gets a W- invoice number and no API key, the owner may change a price, every row's audit says
// "web", and the reads the pages show agree with the postings. db:check passes after each step.

describe.skipIf(!inCi)("selling and buying on the web", () => {
  let shop: TestShop;
  let actor: AuditActor;
  const db = () => database();
  const run = (service: (tx: Tx) => Promise<Answer>) => db().transaction(service);
  /** A dry run as the pipeline does it: the service runs, then everything is rolled back. */
  const dry = (service: (tx: Tx) => Promise<Answer>) =>
    db()
      .transaction(async (tx) => {
        throw Object.assign(new Error("rollback"), { answer: await service(tx) });
      })
      .catch((error: { answer?: Answer }) => {
        if (!error.answer) throw error;
        return error.answer;
      });
  const base = { now: new Date(), query: undefined, dryRun: false };
  const part = { id: "", retail: 0, stock: 0 };
  const garage = { id: "", due: 0 };
  let supplierId = "";

  beforeAll(async () => {
    shop = await createTestShop("tradeweb");
    const owner = await first<{ id: string }>(shop, "select id from users where role = 'owner'");
    actor = { source: "web", userId: owner.id, actingUser: "Shop Owner (demo)" };
    const row = await first<{ id: string; retail_price: string; quantity: string }>(
      shop,
      `select p.id, p.retail_price, l.quantity from parts p join stock_levels l on l.part_id = p.id
       where l.quantity >= 10 and p.is_active and p.deleted_at is null order by p.name_en limit 1`,
    );
    Object.assign(part, { id: row.id, retail: Number(row.retail_price), stock: Number(row.quantity) });
    const customer = await first<{ id: string; due_balance: string }>(
      shop,
      "select id, due_balance from customers where price_tier = 'garage' and deleted_at is null order by name limit 1",
    );
    Object.assign(garage, { id: customer.id, due: Number(customer.due_balance) });
    supplierId = (await first<{ id: string }>(shop, "select id from suppliers order by name limit 1")).id;
  }, 180_000);

  afterAll(async () => shop?.drop());

  it("records a walk-in cash sale with a W- invoice and a price the owner changed, then voids it", async () => {
    const price = part.retail - 100;
    const answer = await dry((tx) =>
      createSale({
        tx,
        actor,
        params: undefined,
        ...base,
        body: {
          customer_id: garage.id,
          items: [{ part_id: part.id, quantity: 2, unit_price_taka: price }],
          payments: [],
        },
        dryRun: true,
      }),
    );
    const total = (answer.body.sale as { total_taka: number }).total_taka;
    const sold = await run((tx) =>
      createSale({
        tx,
        actor,
        params: undefined,
        ...base,
        body: {
          items: [{ part_id: part.id, quantity: 2, unit_price_taka: price }],
          payments: [{ method: "cash", amount_taka: total }],
        },
      }),
    );
    const sale = sold.body.sale as { id: string; invoice_no: string };
    expect(sale.invoice_no).toBe("W-000001");
    const row = await first<{ api_key_id: string | null }>(
      shop,
      "select api_key_id from sales where id = $1",
      [sale.id],
    );
    expect(row.api_key_id).toBeNull();
    const detail = (await saleDetail(db(), sale.id))!;
    expect(detail.items).toMatchObject([
      { part_id: part.id, unit_price: String(price), list_price: String(part.retail) },
    ]);
    expect(detail.payments).toMatchObject([{ method: "cash", amount: String(total) }]);
    const today = await listSales(db(), new Date(Date.now() - 86_400_000), new Date(Date.now() + 60_000));
    expect(today.map((s) => s.id)).toContain(sale.id);
    expect(await stockOfPart(shop, part.id)).toBe(part.stock - 2);

    await run((tx) => voidSale({ tx, actor, params: { id: sale.id }, ...base, body: { reason: "test" } }));
    expect((await saleDetail(db(), sale.id))!.sale.status).toBe("void");
    expect(await stockOfPart(shop, part.id)).toBe(part.stock);
    const audits = await shop.admin.query<{ action: string; source: string; user_id: string }>(
      "select action, source, user_id from audit_logs where entity_id = $1 order by id",
      [sale.id],
    );
    expect(audits.rows).toMatchObject([
      { action: "sale.create", source: "web", user_id: actor.source === "web" ? actor.userId : "" },
      { action: "sale.void", source: "web" },
    ]);
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("sells on credit, takes a return split between the due and cash, and shows what is left to return", async () => {
    const sold = await run((tx) =>
      createSale({
        tx,
        actor,
        params: undefined,
        ...base,
        body: { customer_id: garage.id, items: [{ part_id: part.id, quantity: 3 }], payments: [] },
      }),
    );
    const sale = sold.body.sale as { id: string; total_taka: number; items: { id: string }[] };
    expect(await dueOfCustomer(shop, garage.id)).toBe(garage.due + sale.total_taka);
    const line = sale.items[0]!.id;

    const preview = await dry((tx) =>
      recordReturn({
        tx,
        actor,
        params: undefined,
        ...base,
        dryRun: true,
        body: { sale_id: sale.id, items: [{ sale_item_id: line, quantity: 1 }] },
      }),
    );
    const value = (preview.body.return as { total_taka: number }).total_taka;
    expect(value).toBeGreaterThan(0);

    await run((tx) =>
      recordReturn({
        tx,
        actor,
        params: undefined,
        ...base,
        body: {
          sale_id: sale.id,
          items: [{ sale_item_id: line, quantity: 1, restock: "yes" }],
          refund_due_taka: value - 50,
          refund_cash_taka: 50,
        },
      }),
    );
    const detail = (await saleDetail(db(), sale.id))!;
    expect(Number(detail.items[0]!.returned)).toBe(1);
    expect(detail.returns).toMatchObject([
      { total: String(value), refund_due: String(value - 50), refund_cash: "50" },
    ]);
    expect(await dueOfCustomer(shop, garage.id)).toBe(garage.due + sale.total_taka - (value - 50));
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("receives a customer's payment and reverses it", async () => {
    const before = await dueOfCustomer(shop, garage.id);
    const paid = await run((tx) =>
      receivePayment({
        tx,
        actor,
        params: undefined,
        ...base,
        body: { customer_id: garage.id, method: "cash", amount_taka: 500 },
      }),
    );
    const id = (paid.body.payment as { id: string }).id;
    expect(await dueOfCustomer(shop, garage.id)).toBe(before - 500);
    expect((await customerPaymentList(db(), garage.id))[0]).toMatchObject({
      id,
      amount: "500",
      status: "completed",
    });
    await run((tx) =>
      reversePayment({ tx, actor, params: { id }, ...base, body: { reason: "wrong customer" } }),
    );
    expect(await dueOfCustomer(shop, garage.id)).toBe(before);
    expect((await customerPaymentList(db(), garage.id))[0]).toMatchObject({ id, status: "reversed" });
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("brings stock in with a purchase, owing part of it, and reverses the purchase", async () => {
    const stock = await stockOfPart(shop, part.id);
    const bought = await run((tx) =>
      stockIn({
        tx,
        actor,
        params: undefined,
        ...base,
        body: {
          supplier_id: supplierId,
          bill_no: "WEB-1",
          items: [{ part_id: part.id, quantity: 4, unit_cost_taka: 1000 }],
          payments: [{ method: "cash", amount_taka: 1500 }],
        },
      }),
    );
    const id = (bought.body.purchase as { id: string }).id;
    expect(await stockOfPart(shop, part.id)).toBe(stock + 4);
    const detail = (await purchaseDetail(db(), id))!;
    expect(detail.purchase).toMatchObject({ bill_no: "WEB-1", total: "4000", paid: "1500", due: "2500" });
    const listed = await listPurchases(
      db(),
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 60_000),
      "WEB-1",
    );
    expect(listed.map((p) => p.id)).toEqual([id]);
    await run((tx) =>
      reversePurchase({ tx, actor, params: { id }, ...base, body: { reason: "wrong bill" } }),
    );
    expect(await stockOfPart(shop, part.id)).toBe(stock);
    expect((await purchaseDetail(db(), id))!.purchase.status).toBe("reversed");
    expect(await failedChecks(shop)).toEqual([]);
  });
});
