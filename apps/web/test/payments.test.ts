import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as receivePayment } from "../app/api/v1/customer-payments/route";
import { GET as getPayment } from "../app/api/v1/customer-payments/[id]/route";
import { POST as reversePayment } from "../app/api/v1/customer-payments/[id]/reverse/route";
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
  type TestShop,
} from "./harness";

// Customer payments (spec 6.5, 6.6, 6.10): received into an account or as a cheque, never more than the due (D26),
// reversed with everything back, a dry run that changes nothing, and a void refused after a later payment (D39).

describe.skipIf(!inCi)("customer payments", () => {
  let shop: TestShop;
  let customerId = "";
  let partId = "";
  let paymentId = "";

  const pay = (body: unknown, dry = false) =>
    call(receivePayment, {
      method: "POST",
      path: `/api/v1/customer-payments${dry ? "?dry_run=true" : ""}`,
      body,
    });
  const errorCode = (answer: { body: Record<string, unknown> }) =>
    (answer.body.error as { code: string }).code;

  beforeAll(async () => {
    shop = await createTestShop("payments");
    customerId = (
      await first<{ id: string }>(
        shop,
        "select id from customers where due_balance >= 5000 and deleted_at is null order by name limit 1",
      )
    ).id;
    partId = (
      await first<{ id: string }>(
        shop,
        "select id from parts where is_active and deleted_at is null and retail_price > 0 order by name_en limit 1",
      )
    ).id;
  }, 180_000);

  afterAll(async () => shop?.drop());

  it("checks a payment in a dry run without changing anything, then receives it in cash", async () => {
    const due = await dueOfCustomer(shop, customerId);
    const before = await fingerprintOf(shop);
    const dry = await pay({ customer_id: customerId, amount_taka: 2000, method: "cash" }, true);
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ dry_run: true, customer: { due_balance_taka: due - 2000 } });
    expect(await fingerprintOf(shop)).toEqual(before);

    const paid = await pay({ customer_id: customerId, amount_taka: 2000, method: "cash" });
    expect(paid.status).toBe(201);
    paymentId = (paid.body.payment as { id: string }).id;
    expect(paid.body).toMatchObject({
      payment: { customer_id: customerId, amount_taka: 2000, method: "cash", status: "completed" },
      customer: { id: customerId, due_balance_taka: due - 2000 },
      warnings: [],
      dry_run: false,
    });
    expect(await dueOfCustomer(shop, customerId)).toBe(due - 2000);
    expect(
      await first(shop, "select direction, amount from account_transactions where ref_id = $1", [paymentId]),
    ).toEqual({ direction: "in", amount: "2000" });
    expect(await failedChecks(shop)).toEqual([]);
    expect((await call(getPayment, { params: { id: paymentId } })).body.payment).toEqual(paid.body.payment);
  });

  it("refuses more than the due (D26), a cheque without its details, and an unknown customer", async () => {
    const due = await dueOfCustomer(shop, customerId);
    expect(errorCode(await pay({ customer_id: customerId, amount_taka: due + 1, method: "cash" }))).toBe(
      "PAYMENT_EXCEEDS_DUE",
    );
    expect(errorCode(await pay({ customer_id: customerId, amount_taka: 10, method: "cheque" }))).toBe(
      "CHEQUE_DETAILS_REQUIRED",
    );
    expect(
      errorCode(
        await pay({ customer_id: "0192e011-2a4c-7f3e-b5d1-9c8a7e6f5d40", amount_taka: 10, method: "cash" }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("reverses a payment: the due and the money go back; a second reversal is refused", async () => {
    const due = await dueOfCustomer(shop, customerId);
    const reversed = await call(reversePayment, {
      method: "POST",
      params: { id: paymentId },
      body: { reason: "Undo in DokaanBondhu" },
    });
    expect(reversed.status).toBe(200);
    expect(reversed.body).toMatchObject({
      payment: { status: "reversed", reversal_reason: "Undo in DokaanBondhu" },
      customer: { due_balance_taka: due + 2000 },
    });
    const money = await shop.admin.query(
      "select direction from account_transactions where ref_id = $1 order by created_at",
      [paymentId],
    );
    expect(money.rows.map((row) => row.direction)).toEqual(["in", "out"]);
    expect(await failedChecks(shop)).toEqual([]);
    const again = await call(reversePayment, {
      method: "POST",
      params: { id: paymentId },
      body: { reason: "x" },
    });
    expect(again.status).toBe(409);
    expect(errorCode(again)).toBe("PAYMENT_ALREADY_REVERSED");
  });

  it("takes a cheque as a pending cheque, and cancels it when the payment is reversed", async () => {
    const paid = await pay({
      customer_id: customerId,
      amount_taka: 1500,
      method: "cheque",
      cheque: { bank: "City Bank", cheque_no: "CQ-99", due_date: "2026-10-30" },
    });
    expect(paid.status).toBe(201);
    const chequeId = (paid.body.payment as { cheque_id: string }).cheque_id;
    expect(await first(shop, "select status, amount from cheques where id = $1", [chequeId])).toEqual({
      status: "pending",
      amount: "1500",
    });
    await call(reversePayment, {
      method: "POST",
      params: { id: (paid.body.payment as { id: string }).id },
      body: { reason: "Undo in DokaanBondhu" },
    });
    expect(
      (await first<{ status: string }>(shop, "select status from cheques where id = $1", [chequeId])).status,
    ).toBe("cancelled");
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("refuses to void a credit sale once a later payment has taken its due (D39)", async () => {
    const sale = await call(recordSale, {
      method: "POST",
      path: "/api/v1/sales",
      body: { customer_id: customerId, items: [{ part_id: partId, quantity: 1 }] },
    });
    expect(sale.status).toBe(201);
    const due = await dueOfCustomer(shop, customerId);
    expect((await pay({ customer_id: customerId, amount_taka: due, method: "cash" })).status).toBe(201);
    const voided = await call(voidSale, {
      method: "POST",
      params: { id: (sale.body.sale as { id: string }).id },
      body: { reason: "Undo in DokaanBondhu" },
    });
    expect(voided.status).toBe(422);
    expect(errorCode(voided)).toBe("VOID_EXCEEDS_DUE");
    expect(await failedChecks(shop)).toEqual([]);
  });
});
