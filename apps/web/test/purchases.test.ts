import { newAverageCost } from "@geargrid/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as stockIn } from "../app/api/v1/purchases/route";
import { GET as getPurchase } from "../app/api/v1/purchases/[id]/route";
import { POST as reversePurchase } from "../app/api/v1/purchases/[id]/reverse/route";
import { POST as recordSale } from "../app/api/v1/sales/route";
import {
  call,
  createTestShop,
  failedChecks,
  fingerprintOf,
  first,
  inCi,
  payableOfSupplier,
  stockOfPart,
  type TestShop,
} from "./harness";

// Purchases, the stock-in (spec 6.5-6.7, 6.10): the average cost moves with each line; a reversal puts stock, payable
// and money back, and the average cost only when nothing moved the part since (D93); D39's refusal; a dry run.

describe.skipIf(!inCi)("purchases", () => {
  let shop: TestShop;
  let supplierId = "";
  const part = { id: "", avgCost: 0 };
  let purchaseId = "";

  const avgCostOf = async (id: string) =>
    Number(
      (await first<{ avg_cost: string }>(shop, "select avg_cost from parts where id = $1", [id])).avg_cost,
    );
  const buy = (body: unknown, dry = false) =>
    call(stockIn, { method: "POST", path: `/api/v1/purchases${dry ? "?dry_run=true" : ""}`, body });
  const reverse = (id: string) =>
    call(reversePurchase, { method: "POST", params: { id }, body: { reason: "Undo in DokaanBondhu" } });
  const errorCode = (answer: { body: Record<string, unknown> }) =>
    (answer.body.error as { code: string }).code;

  beforeAll(async () => {
    shop = await createTestShop("purchases");
    supplierId = (await first<{ id: string }>(shop, "select id from suppliers order by name limit 1")).id;
    const row = await first<{ id: string; avg_cost: string }>(
      shop,
      `select p.id, p.avg_cost from parts p join stock_levels l on l.part_id = p.id
       where l.quantity > 0 and p.deleted_at is null order by p.name_en limit 1`,
    );
    part.id = row.id;
    part.avgCost = Number(row.avg_cost);
  }, 180_000);

  afterAll(async () => shop?.drop());

  it("checks a purchase in a dry run without changing anything", async () => {
    const before = await fingerprintOf(shop);
    const dry = await buy(
      { supplier_id: supplierId, items: [{ part_id: part.id, quantity: 4, unit_cost_taka: 1000 }] },
      true,
    );
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ dry_run: true, purchase: { total_taka: 4000, due_taka: 4000 } });
    expect(await fingerprintOf(shop)).toEqual(before);
  });

  it("stocks in: the average cost moves, stock and payable rise, the paid part leaves the cash account", async () => {
    const stock = await stockOfPart(shop, part.id);
    const payable = await payableOfSupplier(shop, supplierId);
    const answer = await buy({
      supplier_id: supplierId,
      bill_no: "B-77",
      items: [{ part_id: part.id, quantity: 4, unit_cost_taka: 1000 }],
      payments: [{ method: "cash", amount_taka: 1500 }],
    });
    expect(answer.status).toBe(201);
    purchaseId = (answer.body.purchase as { id: string }).id;
    expect(answer.body).toMatchObject({
      purchase: { total_taka: 4000, paid_taka: 1500, due_taka: 2500, status: "completed", bill_no: "B-77" },
      supplier: { id: supplierId, payable_balance_taka: payable + 2500 },
    });
    expect(await stockOfPart(shop, part.id)).toBe(stock + 4);
    expect(await avgCostOf(part.id)).toBe(
      Number(newAverageCost(BigInt(Math.round(stock * 1000)), BigInt(part.avgCost), 4000n, 1000n)),
    );
    expect(
      await first(shop, "select avg_cost_before from purchase_items where purchase_id = $1", [purchaseId]),
    ).toEqual({ avg_cost_before: String(part.avgCost) });
    const money = await shop.admin.query(
      "select t.direction, t.amount from account_transactions t join supplier_payments p on p.id = t.ref_id where p.purchase_id = $1",
      [purchaseId],
    );
    expect(money.rows).toEqual([{ direction: "out", amount: "1500" }]);
    expect(await failedChecks(shop)).toEqual([]);
    expect((await call(getPurchase, { params: { id: purchaseId } })).body.purchase).toEqual(
      answer.body.purchase,
    );
  });

  it("refuses payments above the total, an unknown part or supplier, and a line without its cost", async () => {
    const line = { part_id: part.id, quantity: 1, unit_cost_taka: 100 };
    expect(
      errorCode(
        await buy({
          supplier_id: supplierId,
          items: [line],
          payments: [{ method: "cash", amount_taka: 101 }],
        }),
      ),
    ).toBe("PAYMENTS_EXCEED_TOTAL");
    const unknown = "0192e011-2a4c-7f3e-b5d1-9c8a7e6f5d40";
    expect(errorCode(await buy({ supplier_id: supplierId, items: [{ ...line, part_id: unknown }] }))).toBe(
      "PART_NOT_AVAILABLE",
    );
    expect(errorCode(await buy({ supplier_id: unknown, items: [line] }))).toBe("NOT_FOUND");
    expect(
      errorCode(await buy({ supplier_id: supplierId, items: [{ part_id: part.id, quantity: 1 }] })),
    ).toBe("VALIDATION_FAILED");
  });

  it("reverses it: stock, payable and money back, and the average cost too, since nothing moved the part", async () => {
    const stock = await stockOfPart(shop, part.id);
    const payable = await payableOfSupplier(shop, supplierId);
    const answer = await reverse(purchaseId);
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      purchase: { status: "reversed" },
      supplier: { payable_balance_taka: payable - 2500 },
      warnings: [],
    });
    expect(await stockOfPart(shop, part.id)).toBe(stock - 4);
    expect(await avgCostOf(part.id)).toBe(part.avgCost);
    expect(await failedChecks(shop)).toEqual([]);
    const again = await reverse(purchaseId);
    expect(again.status).toBe(409);
    expect(errorCode(again)).toBe("PURCHASE_ALREADY_REVERSED");
  });

  it("keeps the average cost when the part was sold after the purchase, and says so (D93)", async () => {
    const bought = await buy({
      supplier_id: supplierId,
      items: [{ part_id: part.id, quantity: 2, unit_cost_taka: 5000 }],
    });
    const raised = await avgCostOf(part.id);
    const price = Number(
      (await first<{ retail_price: string }>(shop, "select retail_price from parts where id = $1", [part.id]))
        .retail_price,
    );
    const sold = await call(recordSale, {
      method: "POST",
      path: "/api/v1/sales",
      body: {
        items: [{ part_id: part.id, quantity: 1 }],
        payments: [{ method: "cash", amount_taka: price }],
      },
    });
    expect(sold.status).toBe(201);
    const answer = await reverse((bought.body.purchase as { id: string }).id);
    expect(answer.status).toBe(200);
    expect(answer.body.warnings).toMatchObject([{ code: "AVG_COST_KEPT", details: { part_id: part.id } }]);
    expect(await avgCostOf(part.id)).toBe(raised);
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("refuses to reverse a purchase once a later payment has lowered the payable below its due (D39)", async () => {
    const bought = await buy({
      supplier_id: supplierId,
      items: [{ part_id: part.id, quantity: 1, unit_cost_taka: 700 }],
    });
    // a payment to the supplier after the purchase, posted as slice C's supplier payments will post it
    const payable = await payableOfSupplier(shop, supplierId);
    await shop.admin.query(
      `insert into supplier_ledger (id, supplier_id, entry_type, debit, credit, balance_after)
       values (gen_random_uuid(), $1, 'payment', 0, $2, 0)`,
      [supplierId, payable],
    );
    await shop.admin.query("update suppliers set payable_balance = 0 where id = $1", [supplierId]);
    const answer = await reverse((bought.body.purchase as { id: string }).id);
    expect(answer.status).toBe(422);
    expect(errorCode(answer)).toBe("REVERSAL_EXCEEDS_PAYABLE");
    expect(await failedChecks(shop)).toEqual([]);
  });
});
