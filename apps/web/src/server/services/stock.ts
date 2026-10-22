import { formatQuantity, parseQuantity, uuidv7 } from "@geargrid/core";
import { STOCK_ADJUSTMENT_REASONS, type Db, parts, stockAdjustments } from "@geargrid/db";
import { and, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "../db";
import { apiError } from "../http/errors";
import { audit, changed, lockStock, moveStock, type AuditActor } from "../posting";
import { webError } from "./catalog-edit";

// Stock control on the web dashboard (GearGrid plan 2.7 "Stock control"; DokaanBondhu spec D193, C4): an adjustment
// with its reason, a count by rack whose differences become adjustments, the low-stock and dead-stock lists and the
// stock value at average cost. An adjustment is a stock_adjustments row plus a stock movement ("adjustment") at the
// part's average cost, so the stock level always equals its movements (db:check 1).
//   - Low stock: an active part at or below its reorder level (when it has one), or below zero.
//   - Dead stock: an active part with stock and no sale in 90 days.

type Reader = Db | Tx;

export const DEAD_DAYS = 90;

const quantity = z
  .string()
  .trim()
  .regex(/^-?\d{1,9}(\.\d{1,3})?$/);

export const adjustInput = z.object({
  partId: z.uuid(),
  change: quantity.refine((value) => parseQuantity(value) !== 0n, "not zero"),
  reason: z.enum(STOCK_ADJUSTMENT_REASONS),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value === "" ? null : value)),
});
export type AdjustInput = z.infer<typeof adjustInput>;

async function adjustLocked(
  tx: Tx,
  actor: AuditActor,
  part: { id: string; avgCost: bigint },
  change: bigint,
  reason: (typeof STOCK_ADJUSTMENT_REASONS)[number],
  note: string | null,
  now: Date,
): Promise<string> {
  const id = uuidv7();
  await tx.insert(stockAdjustments).values({
    id,
    partId: part.id,
    qtyChange: formatQuantity(change),
    reason,
    note,
    createdAt: now,
    updatedAt: now,
  });
  await changed(tx, "stock_adjustments", id);
  await moveStock(tx, {
    partId: part.id,
    change,
    reason: "adjustment",
    refType: "stock_adjustment",
    refId: id,
    unitCost: part.avgCost,
    now,
  });
  await audit(tx, actor, "stock.adjust", "stock_adjustment", id, null, {
    part_id: part.id,
    qty_change: formatQuantity(change),
    reason,
    note,
  });
  return id;
}

async function partsById(tx: Tx, ids: string[]) {
  const rows = await tx
    .select({ id: parts.id, avgCost: parts.avgCost })
    .from(parts)
    .where(and(inArray(parts.id, ids), isNull(parts.deletedAt)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) if (!byId.has(id)) throw apiError("NOT_FOUND", { entity: "part", id });
  return byId;
}

export async function adjustStock(
  tx: Tx,
  actor: AuditActor,
  input: AdjustInput,
  now = new Date(),
): Promise<void> {
  const part = (await partsById(tx, [input.partId])).get(input.partId)!;
  await lockStock(tx, [part.id]);
  await adjustLocked(tx, actor, part, parseQuantity(input.change), input.reason, input.note, now);
}

export const countInput = z.object({
  counts: z
    .array(
      z.object({
        partId: z.uuid(),
        counted: quantity.refine((value) => !value.startsWith("-"), "not negative"),
      }),
    )
    .min(1)
    .max(500),
});

/** A rack's count: each part whose counted quantity differs from the books gets a "count" adjustment. */
export async function countStock(
  tx: Tx,
  actor: AuditActor,
  input: z.infer<typeof countInput>,
  now = new Date(),
): Promise<number> {
  const ids = input.counts.map((count) => count.partId);
  if (new Set(ids).size !== ids.length) throw webError("PART_TWICE");
  const byId = await partsById(tx, ids);
  const stock = await lockStock(tx, ids);
  let adjusted = 0;
  for (const count of input.counts) {
    const difference = parseQuantity(count.counted) - (stock.get(count.partId) ?? 0n);
    if (difference === 0n) continue;
    await adjustLocked(tx, actor, byId.get(count.partId)!, difference, "count", null, now);
    adjusted += 1;
  }
  return adjusted;
}

export type StockRow = {
  id: string;
  name_en: string;
  name_bn: string | null;
  number: string | null;
  unit: string;
  rack_location: string | null;
  stock: string;
  reorder_level: string;
  avg_cost: string;
  last_sale: Date | null;
};

const columns = sql`p.id, p.name_en, p.name_bn, p.unit, p.rack_location, coalesce(l.quantity, 0) as stock,
  p.reorder_level, p.avg_cost,
  (select n.number from part_numbers n where n.part_id = p.id and n.deleted_at is null
   order by n.is_main desc, n.created_at limit 1) as number,
  (select max(s.sale_time) from sale_items i join sales s on s.id = i.sale_id
   where i.part_id = p.id and s.status = 'completed' and s.deleted_at is null) as last_sale`;

const withDates = (rows: StockRow[]) =>
  rows.map((row) => ({ ...row, last_sale: row.last_sale === null ? null : new Date(row.last_sale) }));

export async function lowStock(db: Reader): Promise<StockRow[]> {
  const result = await db.execute<StockRow>(sql`
    select ${columns} from parts p left join stock_levels l on l.part_id = p.id
    where p.deleted_at is null and p.is_active
      and ((p.reorder_level > 0 and coalesce(l.quantity, 0) <= p.reorder_level) or coalesce(l.quantity, 0) < 0)
    order by coalesce(l.quantity, 0) - p.reorder_level, p.name_en`);
  return withDates(result.rows);
}

export async function deadStock(db: Reader, now = new Date()): Promise<StockRow[]> {
  const since = new Date(now.getTime() - DEAD_DAYS * 86_400_000);
  const result = await db.execute<StockRow>(sql`
    select * from (
      select ${columns} from parts p left join stock_levels l on l.part_id = p.id
      where p.deleted_at is null and p.is_active and coalesce(l.quantity, 0) > 0) x
    where x.last_sale is null or x.last_sale < ${since}
    order by x.stock * x.avg_cost desc, x.name_en`);
  return withDates(result.rows);
}

/** Stock on hand at average cost (parts with stock above zero) and how many parts that is. */
export async function stockValue(db: Reader): Promise<{ value: bigint; parts: number }> {
  const result = await db.execute<{ value: string; parts: string }>(sql`
    select coalesce(sum(round(l.quantity * p.avg_cost)), 0) as value, count(*) as parts
    from parts p join stock_levels l on l.part_id = p.id
    where p.deleted_at is null and l.quantity > 0`);
  return { value: BigInt(result.rows[0]?.value ?? "0"), parts: Number(result.rows[0]?.parts ?? 0) };
}

export async function racks(db: Reader): Promise<string[]> {
  const result = await db.execute<{ rack: string }>(sql`
    select distinct rack_location as rack from parts
    where deleted_at is null and is_active and rack_location is not null
    order by rack_location`);
  return result.rows.map((row) => row.rack);
}

/** The active parts on one rack, for its count sheet. */
export async function rackParts(db: Reader, rack: string): Promise<StockRow[]> {
  const result = await db.execute<StockRow>(sql`
    select ${columns} from parts p left join stock_levels l on l.part_id = p.id
    where p.deleted_at is null and p.is_active and p.rack_location = ${rack}
    order by p.name_en`);
  return withDates(result.rows);
}
