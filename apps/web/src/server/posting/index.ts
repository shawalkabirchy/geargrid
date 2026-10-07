import { formatInvoiceNo, formatQuantity, parseQuantity, uuidv7 } from "@geargrid/core";
import {
  accountTransactions,
  accounts,
  auditLogs,
  changeLog,
  cheques,
  customerLedger,
  customers,
  stockLevels,
  stockMovements,
  supplierLedger,
  suppliers,
} from "@geargrid/db";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Actor } from "../auth/api-key";
import type { Tx } from "../db";
import { apiError } from "../http/errors";

// The posting rules of spec 6.6 as database writes inside the service's transaction: ledgers with their running
// balance, stock movements and levels, account movements, cheques, invoice numbers, the audit row and the change log.
// Callers lock in the one order of spec 6.1: invoice counters, then the customer or supplier, then stock levels by part.

export type CustomerRow = typeof customers.$inferSelect;
export type SupplierRow = typeof suppliers.$inferSelect;
export type PaymentMethod = "cash" | "bkash" | "nagad" | "rocket" | "bank" | "cheque";

/** One change-log row per row inserted or updated (spec 6.8); soft deletes are upserts too. */
export async function changed(tx: Tx, entity: string, ...ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.insert(changeLog).values(ids.map((entityId) => ({ entity, entityId, op: "upsert" })));
}

export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.insert(auditLogs).values({
    apiKeyId: actor.apiKeyId,
    source: actor.source,
    actingUser: actor.actingUser,
    action,
    entity,
    entityId,
    before: before ?? null,
    after: after ?? null,
  });
}

/** The next API invoice number, A-000001 on, under the counter's row lock. */
export async function nextInvoiceNo(tx: Tx): Promise<string> {
  const result = await tx.execute<{ last_sequence: string }>(
    sql`update invoice_counters set last_sequence = last_sequence + 1 where prefix = 'A' returning last_sequence`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("invoice counter A is missing");
  return formatInvoiceNo("A", BigInt(row.last_sequence));
}

export async function lockCustomer(tx: Tx, id: string): Promise<CustomerRow> {
  const [row] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .for("update");
  if (!row) throw apiError("NOT_FOUND", { entity: "customer", id });
  return row;
}

export async function lockSupplier(tx: Tx, id: string): Promise<SupplierRow> {
  const [row] = await tx
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
    .for("update");
  if (!row) throw apiError("NOT_FOUND", { entity: "supplier", id });
  return row;
}

/** Locks the stock levels of the parts, sorted by part, making the missing rows first; returns milli-units by part. */
export async function lockStock(tx: Tx, partIds: string[]): Promise<Map<string, bigint>> {
  const ids = [...new Set(partIds)].sort();
  if (ids.length === 0) return new Map();
  await tx
    .insert(stockLevels)
    .values(ids.map((partId) => ({ partId, quantity: "0" })))
    .onConflictDoNothing();
  const rows = await tx
    .select({ partId: stockLevels.partId, quantity: stockLevels.quantity })
    .from(stockLevels)
    .where(inArray(stockLevels.partId, ids))
    .orderBy(asc(stockLevels.partId))
    .for("update");
  return new Map(rows.map((row) => [row.partId, parseQuantity(row.quantity)]));
}

/** A stock movement and the same change to the stock level. */
export async function moveStock(
  tx: Tx,
  move: {
    partId: string;
    change: bigint;
    reason: string;
    refType: string;
    refId: string;
    unitCost: bigint;
    now: Date;
  },
): Promise<void> {
  const id = uuidv7();
  await tx.insert(stockMovements).values({
    id,
    partId: move.partId,
    qtyChange: formatQuantity(move.change),
    reason: move.reason,
    refType: move.refType,
    refId: move.refId,
    unitCost: move.unitCost,
    createdAt: move.now,
    updatedAt: move.now,
  });
  await tx
    .update(stockLevels)
    .set({
      quantity: sql`${stockLevels.quantity} + ${formatQuantity(move.change)}::numeric`,
      updatedAt: move.now,
    })
    .where(eq(stockLevels.partId, move.partId));
  await changed(tx, "stock_movements", id);
  await changed(tx, "stock_levels", move.partId);
}

/**
 * A customer ledger entry: the due moves by debit - credit, the entry keeps the balance after it, and the customer row
 * is updated. The customer must be locked; its due_balance in `customer` is kept current for the next entry.
 */
export async function customerEntry(
  tx: Tx,
  customer: CustomerRow,
  entry: { type: string; refType: string; refId: string; debit: bigint; credit: bigint; now: Date },
): Promise<void> {
  const balance = customer.dueBalance + entry.debit - entry.credit;
  const id = uuidv7();
  await tx.insert(customerLedger).values({
    id,
    customerId: customer.id,
    entryType: entry.type,
    refType: entry.refType,
    refId: entry.refId,
    debit: entry.debit,
    credit: entry.credit,
    balanceAfter: balance,
    createdAt: entry.now,
    updatedAt: entry.now,
  });
  await tx
    .update(customers)
    .set({ dueBalance: balance, updatedAt: entry.now, version: sql`${customers.version} + 1` })
    .where(eq(customers.id, customer.id));
  customer.dueBalance = balance;
  await changed(tx, "customer_ledger", id);
  await changed(tx, "customers", customer.id);
}

/** The supplier's side, the same way: the payable moves by debit - credit. */
export async function supplierEntry(
  tx: Tx,
  supplier: SupplierRow,
  entry: { type: string; refType: string; refId: string; debit: bigint; credit: bigint; now: Date },
): Promise<void> {
  const balance = supplier.payableBalance + entry.debit - entry.credit;
  const id = uuidv7();
  await tx.insert(supplierLedger).values({
    id,
    supplierId: supplier.id,
    entryType: entry.type,
    refType: entry.refType,
    refId: entry.refId,
    debit: entry.debit,
    credit: entry.credit,
    balanceAfter: balance,
    createdAt: entry.now,
    updatedAt: entry.now,
  });
  await tx
    .update(suppliers)
    .set({ payableBalance: balance, updatedAt: entry.now, version: sql`${suppliers.version} + 1` })
    .where(eq(suppliers.id, supplier.id));
  supplier.payableBalance = balance;
  await changed(tx, "supplier_ledger", id);
  await changed(tx, "suppliers", supplier.id);
}

/** An account movement; the amount is always above zero (spec 6.6). */
export async function moveMoney(
  tx: Tx,
  move: {
    accountId: string;
    direction: "in" | "out";
    amount: bigint;
    refType: string;
    refId: string;
    now: Date;
  },
): Promise<void> {
  const id = uuidv7();
  await tx.insert(accountTransactions).values({
    id,
    accountId: move.accountId,
    direction: move.direction,
    amount: move.amount,
    refType: move.refType,
    refId: move.refId,
    createdAt: move.now,
    updatedAt: move.now,
  });
  await changed(tx, "account_transactions", id);
}

/**
 * The account a payment goes to (spec 6.5): the named one, which must be active and of the method's kind, or the only
 * active account of that kind; several or none is ACCOUNT_REQUIRED.
 */
export async function paymentAccount(
  tx: Tx,
  method: Exclude<PaymentMethod, "cheque">,
  accountId: string | undefined,
): Promise<string> {
  if (accountId) {
    const [account] = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)));
    if (!account) throw apiError("NOT_FOUND", { entity: "account", id: accountId });
    if (!account.isActive || account.kind !== method) {
      throw apiError("ACCOUNT_INVALID", { account_id: accountId, method });
    }
    return account.id;
  }
  const active = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.kind, method), eq(accounts.isActive, true), isNull(accounts.deletedAt)));
  if (active.length !== 1) throw apiError("ACCOUNT_REQUIRED", { method, active_accounts: active.length });
  return active[0]!.id;
}

/** A pending cheque, received from a customer or issued to a supplier. */
export async function addCheque(
  tx: Tx,
  cheque: {
    direction: "received" | "issued";
    partyType: "customer" | "supplier";
    partyId: string;
    bank: string;
    chequeNo: string;
    dueDate: string;
    amount: bigint;
    now: Date;
  },
): Promise<string> {
  const id = uuidv7();
  await tx.insert(cheques).values({
    id,
    direction: cheque.direction,
    partyType: cheque.partyType,
    partyId: cheque.partyId,
    bank: cheque.bank,
    chequeNo: cheque.chequeNo,
    amount: cheque.amount,
    dueDate: cheque.dueDate,
    status: "pending",
    createdAt: cheque.now,
    updatedAt: cheque.now,
  });
  await changed(tx, "cheques", id);
  return id;
}

/**
 * Takes back the money of a payment when it is undone (spec 6.6): an account movement the other way, a pending cheque
 * cancelled, or a cleared cheque paid back from the shop's only active cash account.
 */
export async function undoPaymentMoney(
  tx: Tx,
  payment: { accountId: string | null; chequeId: string | null; amount: bigint },
  direction: "in" | "out",
  ref: { refType: string; refId: string; now: Date },
): Promise<void> {
  if (payment.accountId) {
    await moveMoney(tx, { accountId: payment.accountId, direction, amount: payment.amount, ...ref });
    return;
  }
  if (!payment.chequeId) return;
  const [cheque] = await tx.select().from(cheques).where(eq(cheques.id, payment.chequeId)).for("update");
  if (!cheque) return;
  if (cheque.status === "pending") {
    await tx
      .update(cheques)
      .set({ status: "cancelled", updatedAt: ref.now, version: sql`${cheques.version} + 1` })
      .where(eq(cheques.id, cheque.id));
    await changed(tx, "cheques", cheque.id);
  } else if (cheque.status === "cleared") {
    const cash = await paymentAccount(tx, "cash", undefined);
    await moveMoney(tx, { accountId: cash, direction, amount: payment.amount, ...ref });
  }
}
