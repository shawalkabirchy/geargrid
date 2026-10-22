import { type Db, customerPayments, salePayments, sales } from "@geargrid/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "../db";
import { apiError } from "../http/errors";
import { audit, changed, type AuditActor } from "../posting";

// "Needs review" (GearGrid plan 2.13 rule 8, 8.1): what the owner should look at — parts whose stock went below zero
// and bKash, Nagad or Rocket payments saved without a TrxID (for example a voice sale through DokaanBondhu AI), with a
// way to add the TrxID later; the phone's rejected sync commands join this list in slice C round 2.

type Reader = Db | Tx;

export type NegativeStock = {
  id: string;
  name_en: string;
  name_bn: string | null;
  stock: string;
  unit: string;
};

export type MissingTrx = {
  kind: "sale_payment" | "customer_payment";
  id: string;
  at: Date;
  method: string;
  amount: string;
  reference: string | null;
  link: string;
};

export async function needsReview(
  db: Reader,
): Promise<{ negative: NegativeStock[]; missingTrx: MissingTrx[] }> {
  const negative = await db.execute<NegativeStock>(sql`
    select p.id, p.name_en, p.name_bn, l.quantity as stock, p.unit
    from parts p join stock_levels l on l.part_id = p.id
    where p.deleted_at is null and l.quantity < 0 order by l.quantity, p.name_en`);
  const missing = await db.execute<Omit<MissingTrx, "link"> & { owner_id: string }>(sql`
    select 'sale_payment' as kind, sp.id, s.sale_time as at, sp.method, sp.amount, s.invoice_no as reference,
           s.id as owner_id
    from sale_payments sp join sales s on s.id = sp.sale_id
    where sp.deleted_at is null and s.status = 'completed' and sp.method in ('bkash', 'nagad', 'rocket')
      and sp.trx_id is null
    union all
    select 'customer_payment', cp.id, cp.received_at, cp.method, cp.amount, c.name, c.id
    from customer_payments cp join customers c on c.id = cp.customer_id
    where cp.deleted_at is null and cp.status = 'completed' and cp.method in ('bkash', 'nagad', 'rocket')
      and cp.trx_id is null
    order by at desc limit 200`);
  return {
    negative: negative.rows,
    missingTrx: missing.rows.map(({ owner_id, ...row }) => ({
      ...row,
      at: new Date(row.at),
      link: row.kind === "sale_payment" ? `/sales/${owner_id}` : `/customers/${owner_id}`,
    })),
  };
}

export const trxInput = z.object({
  kind: z.enum(["sale_payment", "customer_payment"]),
  id: z.uuid(),
  trxId: z.string().trim().min(1).max(64),
});

/** Adds a missing TrxID; a sale whose mobile payments all have one loses its TRX_ID_MISSING flag. */
export async function addTrxId(
  tx: Tx,
  actor: AuditActor,
  input: z.infer<typeof trxInput>,
  now = new Date(),
): Promise<void> {
  if (input.kind === "customer_payment") {
    const [row] = await tx
      .update(customerPayments)
      .set({ trxId: input.trxId, updatedAt: now, version: sql`${customerPayments.version} + 1` })
      .where(
        and(
          eq(customerPayments.id, input.id),
          isNull(customerPayments.trxId),
          isNull(customerPayments.deletedAt),
        ),
      )
      .returning({ id: customerPayments.id });
    if (!row) throw apiError("NOT_FOUND", { entity: "customer_payment", id: input.id });
    await changed(tx, "customer_payments", row.id);
    await audit(
      tx,
      actor,
      "customer_payment.trx_id",
      "customer_payment",
      row.id,
      { trx_id: null },
      {
        trx_id: input.trxId,
      },
    );
    return;
  }
  const [payment] = await tx
    .update(salePayments)
    .set({ trxId: input.trxId, updatedAt: now, version: sql`${salePayments.version} + 1` })
    .where(and(eq(salePayments.id, input.id), isNull(salePayments.trxId), isNull(salePayments.deletedAt)))
    .returning({ id: salePayments.id, saleId: salePayments.saleId });
  if (!payment) throw apiError("NOT_FOUND", { entity: "sale_payment", id: input.id });
  await changed(tx, "sale_payments", payment.id);
  const [left] = (
    await tx.execute<{ count: string }>(sql`
    select count(*) from sale_payments where sale_id = ${payment.saleId} and deleted_at is null
      and method in ('bkash', 'nagad', 'rocket') and trx_id is null`)
  ).rows;
  if (Number(left?.count ?? 0) === 0) {
    await tx
      .update(sales)
      .set({
        flags: sql`array_remove(${sales.flags}, 'TRX_ID_MISSING')`,
        updatedAt: now,
        version: sql`${sales.version} + 1`,
      })
      .where(eq(sales.id, payment.saleId));
    await changed(tx, "sales", payment.saleId);
  }
  await audit(
    tx,
    actor,
    "sale_payment.trx_id",
    "sale_payment",
    payment.id,
    { trx_id: null },
    { trx_id: input.trxId },
  );
}
