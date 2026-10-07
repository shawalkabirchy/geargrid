import {
  formatQuantity,
  lineValue,
  parseQuantity,
  saleTotals,
  tierPrice,
  uuidv7,
  type PriceTier,
  type RoundOffStep,
} from "@geargrid/core";
import { parts, returns, saleItems, salePayments, sales, settings } from "@geargrid/db";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "../db";
import { apiError, warning, type Warning } from "../http/errors";
import { iso, quantityNumber, taka } from "../http/json";
import type { Answer, Context } from "../http/pipeline";
import {
  addCheque,
  audit,
  changed,
  customerEntry,
  lockCustomer,
  lockStock,
  moveMoney,
  moveStock,
  nextInvoiceNo,
  paymentAccount,
  undoPaymentMoney,
  type CustomerRow,
  type PaymentMethod,
} from "../posting";

// Sales (spec 6.5, 6.6): POST /sales with a dry run, POST /sales/{id}/void, GET /sales/{id}.

export interface PaymentInput {
  method: PaymentMethod;
  amount_taka: number;
  account_id?: string | undefined;
  trx_id?: string | undefined;
  cheque?: { bank: string; cheque_no: string; due_date: string } | undefined;
}

export interface SaleInput {
  customer_id?: string | null | undefined;
  sale_time?: string | undefined;
  items: { part_id: string; quantity: number; unit_price_taka?: number | undefined }[];
  discount?: { kind: "amount" | "percent"; value: number } | undefined;
  payments: PaymentInput[];
  note?: string | undefined;
}

export const MOBILE_MONEY = new Set<PaymentMethod>(["bkash", "nagad", "rocket"]);

/** A quantity of at most three decimals as milli-units. */
export function milli(quantity: number): bigint {
  return parseQuantity(quantity.toFixed(3));
}

type SaleRow = typeof sales.$inferSelect;
type ItemRow = typeof saleItems.$inferSelect;
type PaymentRow = typeof salePayments.$inferSelect;

export function saleView(sale: SaleRow, items: ItemRow[], payments: PaymentRow[], dryRun = false) {
  return {
    id: sale.id,
    invoice_no: dryRun ? null : sale.invoiceNo,
    customer_id: sale.customerId,
    sale_time: iso(sale.saleTime),
    subtotal_taka: taka(sale.subtotal),
    discount_taka: taka(sale.discount),
    round_off_taka: taka(sale.roundOff),
    total_taka: taka(sale.total),
    paid_taka: taka(sale.paid),
    due_taka: taka(sale.due),
    status: sale.status,
    void_reason: sale.voidReason,
    flags: sale.flags,
    note: sale.note,
    items: items.map((item) => ({
      id: item.id,
      part_id: item.partId,
      quantity: quantityNumber(item.quantity),
      unit_price_taka: taka(item.unitPrice),
      list_price_taka: taka(item.listPrice),
      price_tier: item.priceTier,
      line_total_taka: taka(item.lineTotal),
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount_taka: taka(payment.amount),
      account_id: payment.accountId,
      trx_id: payment.trxId,
      cheque_id: payment.chequeId,
    })),
  };
}

export const customerBalance = (customer: CustomerRow | null) =>
  customer ? { id: customer.id, due_balance_taka: taka(customer.dueBalance) } : null;

async function loadSale(tx: Tx, id: string, lock = false) {
  const query = tx
    .select()
    .from(sales)
    .where(and(eq(sales.id, id), isNull(sales.deletedAt)));
  const [sale] = lock ? await query.for("update") : await query;
  if (!sale) throw apiError("NOT_FOUND", { entity: "sale", id });
  const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id)).orderBy(asc(saleItems.id));
  const payments = await tx
    .select()
    .from(salePayments)
    .where(eq(salePayments.saleId, id))
    .orderBy(asc(salePayments.id));
  return { sale, items, payments };
}

export async function getSale(tx: Tx, id: string) {
  const { sale, items, payments } = await loadSale(tx, id);
  return { sale: saleView(sale, items, payments) };
}

/** Each payment's account (or its cheque details), checked before anything is written; mobile money without a TrxID warns. */
export async function paymentAccounts(
  tx: Tx,
  payments: PaymentInput[],
  hasParty: boolean,
  warnings: Warning[],
): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (const payment of payments) {
    if (payment.method === "cheque") {
      if (!payment.cheque) throw apiError("CHEQUE_DETAILS_REQUIRED");
      if (!hasParty) {
        throw apiError("VALIDATION_FAILED", {
          issues: [{ path: "payments", message: "a cheque needs a customer or supplier" }],
        });
      }
      out.push(null);
    } else {
      out.push(await paymentAccount(tx, payment.method, payment.account_id));
      if (MOBILE_MONEY.has(payment.method) && !payment.trx_id) {
        warnings.push(warning("TRX_ID_MISSING", { method: payment.method }));
      }
    }
  }
  return out;
}

export async function createSale({
  tx,
  actor,
  now,
  body,
  dryRun,
}: Context<undefined, undefined, SaleInput>): Promise<Answer> {
  const saleTime = body.sale_time ? new Date(body.sale_time) : now;
  const warnings: Warning[] = [];

  // Parts: each must exist and not be deleted; an inactive one is sold with a warning.
  const partIds = [...new Set(body.items.map((item) => item.part_id))];
  const partRows = await tx.select().from(parts).where(inArray(parts.id, partIds));
  const partById = new Map(partRows.filter((part) => part.deletedAt === null).map((part) => [part.id, part]));
  for (const id of partIds) if (!partById.has(id)) throw apiError("PART_NOT_AVAILABLE", { part_id: id });
  for (const part of partById.values()) {
    if (!part.isActive) warnings.push(warning("INACTIVE_PART", { part_id: part.id }));
  }

  // Locks in the one order of spec 6.1: the invoice counter, the customer, the stock levels by part. A dry run uses no
  // invoice number.
  const invoiceNo = dryRun ? null : await nextInvoiceNo(tx);
  const customer = body.customer_id ? await lockCustomer(tx, body.customer_id) : null;
  const stock = await lockStock(tx, partIds);

  // Prices: the customer's tier, retail for a walk-in; another price needs prices:write.
  const tier = (customer?.priceTier ?? "retail") as PriceTier;
  const lines = body.items.map((item) => {
    const part = partById.get(item.part_id)!;
    const listPrice = tierPrice(part, tier);
    const unitPrice = item.unit_price_taka === undefined ? listPrice : BigInt(item.unit_price_taka);
    if (unitPrice !== listPrice && !actor.scopes.includes("prices:write")) {
      throw apiError("CUSTOM_PRICE_FORBIDDEN", { part_id: part.id, tier_price_taka: taka(listPrice) });
    }
    return { part, quantityMilli: milli(item.quantity), unitPrice, listPrice };
  });

  const [shop] = await tx.select({ roundOffRule: settings.roundOffRule }).from(settings);
  const discount = body.discount
    ? {
        kind: body.discount.kind,
        value:
          body.discount.kind === "percent"
            ? BigInt(Math.round(body.discount.value * 100))
            : BigInt(body.discount.value),
      }
    : null;
  const totals = saleTotals(lines, discount, (shop?.roundOffRule ?? 1) as RoundOffStep);
  const paid = body.payments.reduce((sum, payment) => sum + BigInt(payment.amount_taka), 0n);
  if (paid > totals.total) {
    throw apiError("PAYMENTS_EXCEED_TOTAL", { total_taka: taka(totals.total), paid_taka: taka(paid) });
  }
  const due = totals.total - paid;
  if (!customer && due > 0n) throw apiError("WALK_IN_CANNOT_HAVE_DUE", { due_taka: taka(due) });
  const accountIds = await paymentAccounts(tx, body.payments, customer !== null, warnings);

  for (const line of lines) {
    const after = (stock.get(line.part.id) ?? 0n) - line.quantityMilli;
    stock.set(line.part.id, after);
    if (after < 0n) warnings.push(warning("LOW_STOCK", { part_id: line.part.id }));
  }
  if (customer && customer.creditLimit !== null && customer.dueBalance + due > customer.creditLimit) {
    warnings.push(warning("OVER_CREDIT_LIMIT", { credit_limit_taka: taka(customer.creditLimit) }));
  }

  // The sale and its postings (spec 6.6).
  const saleId = uuidv7();
  const stamp = { createdAt: now, updatedAt: now };
  const [sale] = await tx
    .insert(sales)
    .values({
      id: saleId,
      invoiceNo: invoiceNo ?? `A-DRYRUN-${saleId}`, // rolled back; the answer says null
      apiKeyId: actor.apiKeyId,
      customerId: customer?.id ?? null,
      saleTime,
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      paid,
      due,
      roundOff: totals.roundOff,
      flags: [...new Set(warnings.map((item) => item.code))],
      note: body.note ?? null,
      ...stamp,
    })
    .returning();
  await changed(tx, "sales", saleId);

  const items: ItemRow[] = [];
  for (const line of lines) {
    const [item] = await tx
      .insert(saleItems)
      .values({
        id: uuidv7(),
        saleId,
        partId: line.part.id,
        quantity: formatQuantity(line.quantityMilli),
        unitPrice: line.unitPrice,
        listPrice: line.listPrice,
        lineTotal: lineValue(line.quantityMilli, line.unitPrice),
        unitCostAtSale: line.part.avgCost,
        priceTier: tier,
        ...stamp,
      })
      .returning();
    items.push(item!);
    await changed(tx, "sale_items", item!.id);
    await moveStock(tx, {
      partId: line.part.id,
      change: -line.quantityMilli,
      reason: "sale",
      refType: "sale",
      refId: saleId,
      unitCost: line.part.avgCost,
      now,
    });
  }

  if (customer) {
    await customerEntry(tx, customer, {
      type: "sale",
      refType: "sale",
      refId: saleId,
      debit: totals.total,
      credit: 0n,
      now,
    });
    if (paid > 0n) {
      await customerEntry(tx, customer, {
        type: "sale_payment",
        refType: "sale",
        refId: saleId,
        debit: 0n,
        credit: paid,
        now,
      });
    }
  }

  const payments: PaymentRow[] = [];
  for (const [index, payment] of body.payments.entries()) {
    const amount = BigInt(payment.amount_taka);
    const chequeId =
      payment.method === "cheque" && customer
        ? await addCheque(tx, {
            direction: "received",
            partyType: "customer",
            partyId: customer.id,
            bank: payment.cheque!.bank,
            chequeNo: payment.cheque!.cheque_no,
            dueDate: payment.cheque!.due_date,
            amount,
            now,
          })
        : null;
    const accountId = accountIds[index] ?? null;
    const [row] = await tx
      .insert(salePayments)
      .values({
        id: uuidv7(),
        saleId,
        accountId,
        method: payment.method,
        amount,
        trxId: payment.trx_id ?? null,
        chequeId,
        ...stamp,
      })
      .returning();
    payments.push(row!);
    await changed(tx, "sale_payments", row!.id);
    if (accountId)
      await moveMoney(tx, { accountId, direction: "in", amount, refType: "sale", refId: saleId, now });
  }

  const view = saleView(sale!, items, payments, dryRun);
  await audit(tx, actor, "sale.create", "sale", saleId, null, view);
  return {
    status: dryRun ? 200 : 201,
    body: { sale: view, customer: customerBalance(customer), warnings, dry_run: dryRun },
  };
}

export async function voidSale({
  tx,
  actor,
  now,
  params,
  body,
}: Context<{ id: string }, undefined, { reason: string }>): Promise<Answer> {
  const { sale, items, payments } = await loadSale(tx, params.id, true);
  if (sale.status === "void") throw apiError("SALE_ALREADY_VOID", { sale_id: sale.id });
  const [returned] = await tx
    .select({ id: returns.id })
    .from(returns)
    .where(and(eq(returns.saleId, sale.id), isNull(returns.deletedAt)))
    .limit(1);
  if (returned) throw apiError("SALE_HAS_RETURNS", { sale_id: sale.id });
  const before = saleView(sale, items, payments);

  const customer = sale.customerId ? await lockCustomer(tx, sale.customerId) : null;
  if (customer && sale.due > customer.dueBalance) {
    throw apiError("VOID_EXCEEDS_DUE", {
      sale_due_taka: taka(sale.due),
      customer_due_taka: taka(customer.dueBalance),
    });
  }
  await lockStock(
    tx,
    items.map((item) => item.partId),
  );
  for (const item of items) {
    await moveStock(tx, {
      partId: item.partId,
      change: parseQuantity(item.quantity),
      reason: "void",
      refType: "sale",
      refId: sale.id,
      unitCost: item.unitCostAtSale,
      now,
    });
  }
  if (customer) {
    // The payment part first, so the running balance never dips below zero on the way (D131).
    if (sale.paid > 0n) {
      await customerEntry(tx, customer, {
        type: "void_payment",
        refType: "sale",
        refId: sale.id,
        debit: sale.paid,
        credit: 0n,
        now,
      });
    }
    await customerEntry(tx, customer, {
      type: "void",
      refType: "sale",
      refId: sale.id,
      debit: 0n,
      credit: sale.total,
      now,
    });
  }
  for (const payment of payments) {
    await undoPaymentMoney(tx, payment, "out", { refType: "sale", refId: sale.id, now });
  }
  const [updated] = await tx
    .update(sales)
    .set({
      status: "void",
      voidReason: body.reason,
      voidedAt: now,
      updatedAt: now,
      version: sql`${sales.version} + 1`,
    })
    .where(eq(sales.id, sale.id))
    .returning();
  await changed(tx, "sales", sale.id);
  const view = saleView(updated!, items, payments);
  await audit(tx, actor, "sale.void", "sale", sale.id, before, view);
  return {
    status: 200,
    body: { sale: view, customer: customerBalance(customer), warnings: [], dry_run: false },
  };
}
