import { uuidv7 } from "@geargrid/core";
import { customerPayments } from "@geargrid/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "../db";
import { apiError, type Warning } from "../http/errors";
import { iso, taka } from "../http/json";
import type { Answer, Context } from "../http/pipeline";
import {
  addCheque,
  audit,
  changed,
  customerEntry,
  lockCustomer,
  moveMoney,
  undoPaymentMoney,
} from "../posting";
import { customerBalance, paymentAccounts, type PaymentInput } from "./sales";

// Customer payments (spec 6.5, 6.6): POST /customer-payments with a dry run, POST /customer-payments/{id}/reverse,
// GET /customer-payments/{id}. A payment may not be more than the customer's due (D26).

export interface PaymentBody extends PaymentInput {
  customer_id: string;
  received_at?: string | undefined;
}

type PaymentRow = typeof customerPayments.$inferSelect;

export function paymentView(row: PaymentRow) {
  return {
    id: row.id,
    customer_id: row.customerId,
    amount_taka: taka(row.amount),
    method: row.method,
    account_id: row.accountId,
    trx_id: row.trxId,
    cheque_id: row.chequeId,
    received_at: iso(row.receivedAt),
    status: row.status,
    reversal_reason: row.reversalReason,
  };
}

async function loadPayment(tx: Tx, id: string, lock = false): Promise<PaymentRow> {
  const query = tx
    .select()
    .from(customerPayments)
    .where(and(eq(customerPayments.id, id), isNull(customerPayments.deletedAt)));
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw apiError("NOT_FOUND", { entity: "customer_payment", id });
  return row;
}

export async function getPayment(tx: Tx, id: string) {
  return { payment: paymentView(await loadPayment(tx, id)) };
}

export async function receivePayment({
  tx,
  actor,
  now,
  body,
  dryRun,
}: Context<undefined, undefined, PaymentBody>): Promise<Answer> {
  const customer = await lockCustomer(tx, body.customer_id);
  const amount = BigInt(body.amount_taka);
  if (amount > customer.dueBalance) {
    throw apiError("PAYMENT_EXCEEDS_DUE", {
      amount_taka: taka(amount),
      due_taka: taka(customer.dueBalance),
    });
  }
  const warnings: Warning[] = [];
  const [accountId] = await paymentAccounts(tx, [body], true, warnings);
  const receivedAt = body.received_at ? new Date(body.received_at) : now;
  const id = uuidv7();
  const chequeId =
    body.method === "cheque"
      ? await addCheque(tx, {
          direction: "received",
          partyType: "customer",
          partyId: customer.id,
          bank: body.cheque!.bank,
          chequeNo: body.cheque!.cheque_no,
          dueDate: body.cheque!.due_date,
          amount,
          now,
        })
      : null;
  const [row] = await tx
    .insert(customerPayments)
    .values({
      id,
      customerId: customer.id,
      accountId: accountId ?? null,
      amount,
      method: body.method,
      trxId: body.trx_id ?? null,
      chequeId,
      receivedAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await changed(tx, "customer_payments", id);
  await customerEntry(tx, customer, {
    type: "payment",
    refType: "customer_payment",
    refId: id,
    debit: 0n,
    credit: amount,
    now,
  });
  if (accountId) {
    await moveMoney(tx, { accountId, direction: "in", amount, refType: "customer_payment", refId: id, now });
  }
  const view = paymentView(row!);
  await audit(tx, actor, "customer_payment.create", "customer_payment", id, null, view);
  return {
    status: dryRun ? 200 : 201,
    body: { payment: view, customer: customerBalance(customer), warnings, dry_run: dryRun },
  };
}

export async function reversePayment({
  tx,
  actor,
  now,
  params,
  body,
}: Context<{ id: string }, undefined, { reason: string }>): Promise<Answer> {
  const payment = await loadPayment(tx, params.id, true);
  if (payment.status === "reversed") throw apiError("PAYMENT_ALREADY_REVERSED", { payment_id: payment.id });
  const before = paymentView(payment);
  const customer = await lockCustomer(tx, payment.customerId);
  await customerEntry(tx, customer, {
    type: "payment_reversal",
    refType: "customer_payment",
    refId: payment.id,
    debit: payment.amount,
    credit: 0n,
    now,
  });
  await undoPaymentMoney(tx, payment, "out", { refType: "customer_payment", refId: payment.id, now });
  const [updated] = await tx
    .update(customerPayments)
    .set({
      status: "reversed",
      reversedAt: now,
      reversalReason: body.reason,
      updatedAt: now,
      version: sql`${customerPayments.version} + 1`,
    })
    .where(eq(customerPayments.id, payment.id))
    .returning();
  await changed(tx, "customer_payments", payment.id);
  const view = paymentView(updated!);
  await audit(tx, actor, "customer_payment.reverse", "customer_payment", payment.id, before, view);
  return {
    status: 200,
    body: { payment: view, customer: customerBalance(customer), warnings: [], dry_run: false },
  };
}
