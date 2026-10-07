import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as recordReturn } from "../app/api/v1/returns/route";
import { GET as getReturn } from "../app/api/v1/returns/[id]/route";
import { POST as recordSale } from "../app/api/v1/sales/route";
import { POST as voidSale } from "../app/api/v1/sales/[id]/void/route";
import {
  call,
  createTestShop,
  dueOfCustomer,
  failedChecks,
  fingerprintOf,
  first,
  inCi,
  stockOfPart,
  type TestShop,
} from "./harness";

// Returns (spec 6.5-6.7, 6.10): a dry run that gives the total and the due without the refund; the refund split between
// the due and cash; restocked or damaged lines; the refusals; and the rules between returns and voids (D29).

describe.skipIf(!inCi)("returns", () => {
  let shop: TestShop;
  let customerId = "";
  let partId = "";
  const sale = { id: "", lineId: "", total: 0 };

  const errorCode = (answer: { body: Record<string, unknown> }) =>
    (answer.body.error as { code: string }).code;
  const giveBack = (body: unknown, dry = false) =>
    call(recordReturn, { method: "POST", path: `/api/v1/returns${dry ? "?dry_run=true" : ""}`, body });
  const sell = (body: unknown) => call(recordSale, { method: "POST", path: "/api/v1/sales", body });

  beforeAll(async () => {
    shop = await createTestShop("returns");
    customerId = (
      await first<{ id: string }>(
        shop,
        "select id from customers where deleted_at is null order by name limit 1",
      )
    ).id;
    partId = (
      await first<{ id: string }>(
        shop,
        "select id from parts where is_active and deleted_at is null and retail_price > 0 order by name_en limit 1",
      )
    ).id;
    const answer = await sell({ customer_id: customerId, items: [{ part_id: partId, quantity: 3 }] });
    const body = answer.body.sale as { id: string; total_taka: number; items: { id: string }[] };
    sale.id = body.id;
    sale.lineId = body.items[0]!.id;
    sale.total = body.total_taka;
  }, 180_000);

  afterAll(async () => shop?.drop());

  it("gives the total and the customer's due in a dry run without the refund, changing nothing", async () => {
    const before = await fingerprintOf(shop);
    const dry = await giveBack(
      { sale_id: sale.id, items: [{ sale_item_id: sale.lineId, quantity: 1 }] },
      true,
    );
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({
      dry_run: true,
      return: { total_taka: Math.round(sale.total / 3), refund_due_taka: null, refund_cash_taka: null },
      customer: { id: customerId, due_balance_taka: await dueOfCustomer(shop, customerId) },
    });
    expect(await fingerprintOf(shop)).toEqual(before);
  });

  it("refuses a real return without the refund, a refund that does not add up, and more than was sold", async () => {
    const item = { sale_item_id: sale.lineId, quantity: 1 };
    expect(errorCode(await giveBack({ sale_id: sale.id, items: [item] }))).toBe("RETURN_REFUND_REQUIRED");
    expect(
      errorCode(await giveBack({ sale_id: sale.id, items: [item], refund_due_taka: 1, refund_cash_taka: 1 })),
    ).toBe("RETURN_REFUND_MISMATCH");
    expect(
      errorCode(
        await giveBack({
          sale_id: sale.id,
          items: [{ sale_item_id: sale.lineId, quantity: 4 }],
          refund_due_taka: 0,
          refund_cash_taka: 0,
        }),
      ),
    ).toBe("RETURN_QTY_TOO_HIGH");
  });

  it("takes one back off the due, back into stock, and reads it back", async () => {
    const due = await dueOfCustomer(shop, customerId);
    const stock = await stockOfPart(shop, partId);
    const total = Math.round(sale.total / 3);
    const answer = await giveBack({
      sale_id: sale.id,
      items: [{ sale_item_id: sale.lineId, quantity: 1 }],
      refund_due_taka: total,
      refund_cash_taka: 0,
      reason: "Wrong part",
    });
    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({
      return: { total_taka: total, refund_due_taka: total, refund_cash_taka: 0, reason: "Wrong part" },
      customer: { due_balance_taka: due - total },
    });
    expect(await dueOfCustomer(shop, customerId)).toBe(due - total);
    expect(await stockOfPart(shop, partId)).toBe(stock + 1);
    expect(await failedChecks(shop)).toEqual([]);
    const id = (answer.body.return as { id: string }).id;
    expect((await call(getReturn, { params: { id } })).body.return).toEqual(answer.body.return);
  });

  it("pays a cash refund out of the cash account, and leaves a damaged part out of stock", async () => {
    const stock = await stockOfPart(shop, partId);
    const total = Math.round(sale.total / 3);
    const answer = await giveBack({
      sale_id: sale.id,
      items: [{ sale_item_id: sale.lineId, quantity: 1, restock: "damaged" }],
      refund_due_taka: 0,
      refund_cash_taka: total,
    });
    expect(answer.status).toBe(201);
    const id = (answer.body.return as { id: string }).id;
    expect(
      await first(shop, "select direction, amount from account_transactions where ref_id = $1", [id]),
    ).toEqual({
      direction: "out",
      amount: String(total),
    });
    expect(await stockOfPart(shop, partId)).toBe(stock);
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("refuses to void a sale with returns, a due refund on a walk-in sale, and a return on a void sale (D29)", async () => {
    const voided = await call(voidSale, { method: "POST", params: { id: sale.id }, body: { reason: "x" } });
    expect(voided.status).toBe(409);
    expect(errorCode(voided)).toBe("SALE_HAS_RETURNS");

    const price = Number(
      (await first<{ retail_price: string }>(shop, "select retail_price from parts where id = $1", [partId]))
        .retail_price,
    );
    const walkIn = await sell({
      items: [{ part_id: partId, quantity: 1 }],
      payments: [{ method: "cash", amount_taka: price }],
    });
    const walkInSale = walkIn.body.sale as { id: string; items: { id: string }[] };
    expect(
      errorCode(
        await giveBack({
          sale_id: walkInSale.id,
          items: [{ sale_item_id: walkInSale.items[0]!.id, quantity: 1 }],
          refund_due_taka: price,
          refund_cash_taka: 0,
        }),
      ),
    ).toBe("REFUND_DUE_EXCEEDS_BALANCE");

    await call(voidSale, {
      method: "POST",
      params: { id: walkInSale.id },
      body: { reason: "Undo in DokaanBondhu" },
    });
    const onVoid = await giveBack({
      sale_id: walkInSale.id,
      items: [{ sale_item_id: walkInSale.items[0]!.id, quantity: 1 }],
      refund_due_taka: 0,
      refund_cash_taka: price,
    });
    expect(onVoid.status).toBe(409);
    expect(errorCode(onVoid)).toBe("SALE_IS_VOID");
    expect(await failedChecks(shop)).toEqual([]);
  });
});
