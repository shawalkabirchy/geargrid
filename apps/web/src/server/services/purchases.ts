import { formatQuantity, lineValue, newAverageCost, parseQuantity, uuidv7 } from "@geargrid/core";
import { parts, purchaseItems, purchases, stockMovements, supplierPayments } from "@geargrid/db";
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Tx } from "../db";
import { apiError, warning, type Warning } from "../http/errors";
import { iso, quantityNumber, taka } from "../http/json";
import type { Answer, Context } from "../http/pipeline";
import {
  addCheque,
  audit,
  changed,
  lockStock,
  lockSupplier,
  moveMoney,
  moveStock,
  supplierEntry,
  undoPaymentMoney,
  type SupplierRow,
} from "../posting";
import { milli, paymentAccounts, type PaymentInput } from "./sales";

// Purchases, the stock-in (spec 6.5, 6.6): POST /purchases with a dry run, POST /purchases/{id}/reverse,
// GET /purchases/{id}. Each line moves the part's average cost; a reversal puts it back only when nothing has moved
// the part since (D93).

export interface PurchaseInput {
  supplier_id: string;
  bill_no?: string | undefined;
  purchase_time?: string | undefined;
  items: { part_id: string; quantity: number; unit_cost_taka: number }[];
  payments: PaymentInput[];
}

type PurchaseRow = typeof purchases.$inferSelect;
type ItemRow = typeof purchaseItems.$inferSelect;
type PaymentRow = typeof supplierPayments.$inferSelect;

export function purchaseView(purchase: PurchaseRow, items: ItemRow[], payments: PaymentRow[]) {
  return {
    id: purchase.id,
    supplier_id: purchase.supplierId,
    bill_no: purchase.billNo,
    purchase_time: iso(purchase.purchaseTime),
    total_taka: taka(purchase.total),
    paid_taka: taka(purchase.paid),
    due_taka: taka(purchase.due),
    status: purchase.status,
    reversal_reason: purchase.reversalReason,
    items: items.map((item) => ({
      id: item.id,
      part_id: item.partId,
      quantity: quantityNumber(item.quantity),
      unit_cost_taka: taka(item.unitCost),
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

const supplierBalance = (supplier: SupplierRow) => ({
  id: supplier.id,
  payable_balance_taka: taka(supplier.payableBalance),
});

async function loadPurchase(tx: Tx, id: string, lock = false) {
  const query = tx
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, id), isNull(purchases.deletedAt)));
  const [purchase] = lock ? await query.for("update") : await query;
  if (!purchase) throw apiError("NOT_FOUND", { entity: "purchase", id });
  const items = await tx
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, id))
    .orderBy(asc(purchaseItems.createdAt), asc(purchaseItems.id));
  const payments = await tx
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.purchaseId, id))
    .orderBy(asc(supplierPayments.id));
  return { purchase, items, payments };
}

export async function getPurchase(tx: Tx, id: string) {
  const { purchase, items, payments } = await loadPurchase(tx, id);
  return { purchase: purchaseView(purchase, items, payments) };
}

export async function stockIn({
  tx,
  actor,
  now,
  body,
  dryRun,
}: Context<undefined, undefined, PurchaseInput>): Promise<Answer> {
  const partIds = [...new Set(body.items.map((item) => item.part_id))];
  const partRows = await tx.select().from(parts).where(inArray(parts.id, partIds));
  const partById = new Map(partRows.filter((part) => part.deletedAt === null).map((part) => [part.id, part]));
  for (const id of partIds) if (!partById.has(id)) throw apiError("PART_NOT_AVAILABLE", { part_id: id });

  const supplier = await lockSupplier(tx, body.supplier_id);
  const stock = await lockStock(tx, partIds);
  const lines = body.items.map((item) => ({
    partId: item.part_id,
    quantityMilli: milli(item.quantity),
    unitCost: BigInt(item.unit_cost_taka),
  }));
  const total = lines.reduce((sum, line) => sum + lineValue(line.quantityMilli, line.unitCost), 0n);
  const paid = body.payments.reduce((sum, payment) => sum + BigInt(payment.amount_taka), 0n);
  if (paid > total)
    throw apiError("PAYMENTS_EXCEED_TOTAL", { total_taka: taka(total), paid_taka: taka(paid) });
  const warnings: Warning[] = [];
  const accountIds = await paymentAccounts(tx, body.payments, true, warnings);

  const purchaseId = uuidv7();
  const stamp = { createdAt: now, updatedAt: now };
  const [purchase] = await tx
    .insert(purchases)
    .values({
      id: purchaseId,
      supplierId: supplier.id,
      billNo: body.bill_no ?? null,
      purchaseTime: body.purchase_time ? new Date(body.purchase_time) : now,
      total,
      paid,
      due: total - paid,
      ...stamp,
    })
    .returning();
  await changed(tx, "purchases", purchaseId);

  const items: ItemRow[] = [];
  for (const line of lines) {
    const part = partById.get(line.partId)!;
    const avgCostBefore = part.avgCost;
    part.avgCost = newAverageCost(stock.get(part.id) ?? 0n, part.avgCost, line.quantityMilli, line.unitCost);
    await tx
      .update(parts)
      .set({ avgCost: part.avgCost, updatedAt: now, version: sql`${parts.version} + 1` })
      .where(eq(parts.id, part.id));
    await changed(tx, "parts", part.id);
    const [item] = await tx
      .insert(purchaseItems)
      .values({
        id: uuidv7(),
        purchaseId,
        partId: part.id,
        quantity: formatQuantity(line.quantityMilli),
        unitCost: line.unitCost,
        lineTotal: lineValue(line.quantityMilli, line.unitCost),
        avgCostBefore,
        ...stamp,
      })
      .returning();
    items.push(item!);
    await changed(tx, "purchase_items", item!.id);
    await moveStock(tx, {
      partId: part.id,
      change: line.quantityMilli,
      reason: "purchase",
      refType: "purchase",
      refId: purchaseId,
      unitCost: line.unitCost,
      now,
    });
    stock.set(part.id, (stock.get(part.id) ?? 0n) + line.quantityMilli);
  }

  await supplierEntry(tx, supplier, {
    type: "purchase",
    refType: "purchase",
    refId: purchaseId,
    debit: total,
    credit: 0n,
    now,
  });
  const payments: PaymentRow[] = [];
  for (const [index, payment] of body.payments.entries()) {
    const amount = BigInt(payment.amount_taka);
    const paymentId = uuidv7();
    const chequeId =
      payment.method === "cheque"
        ? await addCheque(tx, {
            direction: "issued",
            partyType: "supplier",
            partyId: supplier.id,
            bank: payment.cheque!.bank,
            chequeNo: payment.cheque!.cheque_no,
            dueDate: payment.cheque!.due_date,
            amount,
            now,
          })
        : null;
    const accountId = accountIds[index] ?? null;
    const [row] = await tx
      .insert(supplierPayments)
      .values({
        id: paymentId,
        supplierId: supplier.id,
        purchaseId,
        accountId,
        amount,
        method: payment.method,
        trxId: payment.trx_id ?? null,
        chequeId,
        paidAt: now,
        ...stamp,
      })
      .returning();
    payments.push(row!);
    await changed(tx, "supplier_payments", paymentId);
    await supplierEntry(tx, supplier, {
      type: "purchase_payment",
      refType: "supplier_payment",
      refId: paymentId,
      debit: 0n,
      credit: amount,
      now,
    });
    if (accountId) {
      await moveMoney(tx, {
        accountId,
        direction: "out",
        amount,
        refType: "supplier_payment",
        refId: paymentId,
        now,
      });
    }
  }

  const view = purchaseView(purchase!, items, payments);
  await audit(tx, actor, "purchase.create", "purchase", purchaseId, null, view);
  return {
    status: dryRun ? 200 : 201,
    body: { purchase: view, supplier: supplierBalance(supplier), warnings, dry_run: dryRun },
  };
}

export async function reversePurchase({
  tx,
  actor,
  now,
  params,
  body,
}: Context<{ id: string }, undefined, { reason: string }>): Promise<Answer> {
  const { purchase, items, payments } = await loadPurchase(tx, params.id, true);
  if (purchase.status === "reversed") {
    throw apiError("PURCHASE_ALREADY_REVERSED", { purchase_id: purchase.id });
  }
  const before = purchaseView(purchase, items, payments);
  const supplier = await lockSupplier(tx, purchase.supplierId);
  if (purchase.due > supplier.payableBalance) {
    throw apiError("REVERSAL_EXCEEDS_PAYABLE", {
      purchase_due_taka: taka(purchase.due),
      payable_taka: taka(supplier.payableBalance),
    });
  }
  const partIds = items.map((item) => item.partId);
  await lockStock(tx, partIds);

  // D93: each part's average cost goes back to what its first line replaced, unless the part moved after the purchase.
  const warnings: Warning[] = [];
  const firstLine = new Map<string, ItemRow>();
  for (const item of items) if (!firstLine.has(item.partId)) firstLine.set(item.partId, item);
  for (const [partId, item] of firstLine) {
    const [later] = await tx
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.partId, partId),
          sql`${stockMovements.createdAt} > ${purchase.createdAt}`,
          or(ne(stockMovements.refType, "purchase"), ne(stockMovements.refId, purchase.id)),
        ),
      )
      .limit(1);
    if (later) {
      warnings.push(warning("AVG_COST_KEPT", { part_id: partId }));
      continue;
    }
    await tx
      .update(parts)
      .set({ avgCost: item.avgCostBefore, updatedAt: now, version: sql`${parts.version} + 1` })
      .where(eq(parts.id, partId));
    await changed(tx, "parts", partId);
  }
  for (const item of items) {
    await moveStock(tx, {
      partId: item.partId,
      change: -parseQuantity(item.quantity),
      reason: "purchase_reversal",
      refType: "purchase",
      refId: purchase.id,
      unitCost: item.unitCost,
      now,
    });
  }
  // The payment part first, so the running balance never dips below zero on the way (as for a void, D131).
  if (purchase.paid > 0n) {
    await supplierEntry(tx, supplier, {
      type: "payment_reversal",
      refType: "purchase",
      refId: purchase.id,
      debit: purchase.paid,
      credit: 0n,
      now,
    });
  }
  await supplierEntry(tx, supplier, {
    type: "purchase_reversal",
    refType: "purchase",
    refId: purchase.id,
    debit: 0n,
    credit: purchase.total,
    now,
  });
  for (const payment of payments) {
    await undoPaymentMoney(tx, payment, "in", { refType: "purchase", refId: purchase.id, now });
  }
  const [updated] = await tx
    .update(purchases)
    .set({
      status: "reversed",
      reversedAt: now,
      reversalReason: body.reason,
      updatedAt: now,
      version: sql`${purchases.version} + 1`,
    })
    .where(eq(purchases.id, purchase.id))
    .returning();
  await changed(tx, "purchases", purchase.id);
  const view = purchaseView(updated!, items, payments);
  await audit(tx, actor, "purchase.reverse", "purchase", purchase.id, before, view);
  return {
    status: 200,
    body: { purchase: view, supplier: supplierBalance(supplier), warnings, dry_run: false },
  };
}
