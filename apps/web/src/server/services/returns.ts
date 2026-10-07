import { formatQuantity, parseQuantity, returnTotal, uuidv7 } from "@geargrid/core";
import { accounts, returnItems, returns, saleItems, sales } from "@geargrid/db";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "../db";
import { apiError } from "../http/errors";
import { iso, quantityNumber, taka } from "../http/json";
import type { Answer, Context } from "../http/pipeline";
import {
  audit,
  changed,
  customerEntry,
  lockCustomer,
  lockStock,
  moveMoney,
  moveStock,
  paymentAccount,
} from "../posting";
import { customerBalance, milli } from "./sales";

// Returns (spec 6.5-6.7): POST /returns with a dry run, GET /returns/{id}. A return's value shares out the sale's
// discount and round-off (D27). A dry run may leave the refund out: it answers the total and the customer's due, from
// which DokaanBondhu works out its default split (spec 11.9).

export interface ReturnInput {
  sale_id: string;
  items: { sale_item_id: string; quantity: number; restock?: "yes" | "damaged" | undefined }[];
  refund_due_taka?: number | undefined;
  refund_cash_taka?: number | undefined;
  account_id?: string | undefined;
  reason?: string | undefined;
  return_time?: string | undefined;
}

type ReturnRow = typeof returns.$inferSelect;
type ReturnItemRow = typeof returnItems.$inferSelect;

export function returnView(row: ReturnRow, items: ReturnItemRow[]) {
  return {
    id: row.id,
    sale_id: row.saleId,
    customer_id: row.customerId,
    return_time: iso(row.returnTime),
    total_taka: taka(row.total),
    refund_due_taka: taka(row.refundDue) as number | null,
    refund_cash_taka: taka(row.refundCash) as number | null,
    account_id: row.accountId,
    reason: row.reason,
    items: items.map((item) => ({
      id: item.id,
      sale_item_id: item.saleItemId,
      part_id: item.partId,
      quantity: quantityNumber(item.quantity),
      unit_price_taka: taka(item.unitPrice),
      restock: item.restock,
    })),
  };
}

export async function getReturn(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(returns)
    .where(and(eq(returns.id, id), isNull(returns.deletedAt)));
  if (!row) throw apiError("NOT_FOUND", { entity: "return", id });
  const items = await tx
    .select()
    .from(returnItems)
    .where(eq(returnItems.returnId, id))
    .orderBy(asc(returnItems.id));
  return { return: returnView(row, items) };
}

export async function recordReturn({
  tx,
  actor,
  now,
  body,
  dryRun,
}: Context<undefined, undefined, ReturnInput>): Promise<Answer> {
  // The sale is locked, so two returns of one sale are counted one after the other.
  const [sale] = await tx
    .select()
    .from(sales)
    .where(and(eq(sales.id, body.sale_id), isNull(sales.deletedAt)))
    .for("update");
  if (!sale) throw apiError("NOT_FOUND", { entity: "sale", id: body.sale_id });
  if (sale.status === "void") throw apiError("SALE_IS_VOID", { sale_id: sale.id });

  const lineIds = [...new Set(body.items.map((item) => item.sale_item_id))];
  const lineRows = await tx
    .select()
    .from(saleItems)
    .where(and(eq(saleItems.saleId, sale.id), inArray(saleItems.id, lineIds)));
  const lineById = new Map(lineRows.map((row) => [row.id, row]));
  for (const id of lineIds) if (!lineById.has(id)) throw apiError("NOT_FOUND", { entity: "sale_item", id });
  const earlier = await tx
    .select({ saleItemId: returnItems.saleItemId, quantity: sql<string>`sum(${returnItems.quantity})` })
    .from(returnItems)
    .innerJoin(returns, eq(returns.id, returnItems.returnId))
    .where(and(inArray(returnItems.saleItemId, lineIds), isNull(returns.deletedAt)))
    .groupBy(returnItems.saleItemId);
  const returnedBefore = new Map(earlier.map((row) => [row.saleItemId, parseQuantity(row.quantity)]));
  const asked = new Map<string, bigint>();
  const lines = body.items.map((item) => {
    const line = lineById.get(item.sale_item_id)!;
    const quantityMilli = milli(item.quantity);
    const total = (asked.get(line.id) ?? 0n) + quantityMilli;
    asked.set(line.id, total);
    const left = parseQuantity(line.quantity) - (returnedBefore.get(line.id) ?? 0n);
    if (total > left) {
      throw apiError("RETURN_QTY_TOO_HIGH", { sale_item_id: line.id, returnable: Number(left) / 1000 });
    }
    return { line, quantityMilli, unitPrice: line.unitPrice, restock: item.restock ?? "yes" };
  });
  const total = returnTotal(lines, sale);

  const customer = sale.customerId ? await lockCustomer(tx, sale.customerId) : null;
  const haveRefund = body.refund_due_taka !== undefined && body.refund_cash_taka !== undefined;
  if (!haveRefund) {
    if (!dryRun) throw apiError("RETURN_REFUND_REQUIRED", { total_taka: taka(total) });
    // A dry run without the refund: the total and the due DokaanBondhu splits it from; nothing is written.
    return {
      status: 200,
      body: {
        return: {
          id: null,
          sale_id: sale.id,
          customer_id: sale.customerId,
          return_time: iso(body.return_time ? new Date(body.return_time) : now),
          total_taka: taka(total),
          refund_due_taka: null,
          refund_cash_taka: null,
          account_id: null,
          reason: body.reason ?? null,
          items: lines.map((item) => ({
            id: null,
            sale_item_id: item.line.id,
            part_id: item.line.partId,
            quantity: Number(item.quantityMilli) / 1000,
            unit_price_taka: taka(item.unitPrice),
            restock: item.restock,
          })),
        },
        customer: customerBalance(customer),
        warnings: [],
        dry_run: true,
      },
    };
  }
  const refundDue = BigInt(body.refund_due_taka!);
  const refundCash = BigInt(body.refund_cash_taka!);
  if (refundDue + refundCash !== total) {
    throw apiError("RETURN_REFUND_MISMATCH", { total_taka: taka(total) });
  }
  if (refundDue > (customer?.dueBalance ?? 0n)) {
    throw apiError("REFUND_DUE_EXCEEDS_BALANCE", { due_taka: taka(customer?.dueBalance ?? 0n) });
  }
  let accountId: string | null = null;
  if (refundCash > 0n) {
    if (body.account_id) {
      const [account] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, body.account_id), isNull(accounts.deletedAt)));
      if (!account) throw apiError("NOT_FOUND", { entity: "account", id: body.account_id });
      if (!account.isActive) throw apiError("ACCOUNT_INVALID", { account_id: account.id });
      accountId = account.id;
    } else {
      accountId = await paymentAccount(tx, "cash", undefined);
    }
  }
  await lockStock(
    tx,
    lines.map((item) => item.line.partId),
  );

  const returnId = uuidv7();
  const stamp = { createdAt: now, updatedAt: now };
  const [row] = await tx
    .insert(returns)
    .values({
      id: returnId,
      saleId: sale.id,
      customerId: sale.customerId,
      returnTime: body.return_time ? new Date(body.return_time) : now,
      total,
      refundDue,
      refundCash,
      accountId,
      reason: body.reason ?? null,
      ...stamp,
    })
    .returning();
  await changed(tx, "returns", returnId);
  const items: ReturnItemRow[] = [];
  for (const item of lines) {
    const [itemRow] = await tx
      .insert(returnItems)
      .values({
        id: uuidv7(),
        returnId,
        saleItemId: item.line.id,
        partId: item.line.partId,
        quantity: formatQuantity(item.quantityMilli),
        unitPrice: item.unitPrice,
        restock: item.restock,
        ...stamp,
      })
      .returning();
    items.push(itemRow!);
    await changed(tx, "return_items", itemRow!.id);
    if (item.restock === "yes") {
      await moveStock(tx, {
        partId: item.line.partId,
        change: item.quantityMilli,
        reason: "return",
        refType: "return",
        refId: returnId,
        unitCost: item.line.unitCostAtSale,
        now,
      });
    }
  }
  if (customer && refundDue > 0n) {
    await customerEntry(tx, customer, {
      type: "return",
      refType: "return",
      refId: returnId,
      debit: 0n,
      credit: refundDue,
      now,
    });
  }
  if (accountId) {
    await moveMoney(tx, {
      accountId,
      direction: "out",
      amount: refundCash,
      refType: "return",
      refId: returnId,
      now,
    });
  }
  const view = returnView(row!, items);
  await audit(tx, actor, "return.create", "return", returnId, null, view);
  return {
    status: dryRun ? 200 : 201,
    body: { return: view, customer: customerBalance(customer), warnings: [], dry_run: dryRun },
  };
}
