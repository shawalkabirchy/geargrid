import { customers, fitments, parts, stockLevels, suppliers } from "@geargrid/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "../db";
import { apiError } from "../http/errors";
import { iso, quantityNumber, taka, takaOrNull } from "../http/json";

// Read back by ID (spec 6.5): the same entity shapes as the writes; a soft-deleted row is 404.

type CustomerRow = typeof customers.$inferSelect;
type SupplierRow = typeof suppliers.$inferSelect;
type PartRow = typeof parts.$inferSelect;
type FitmentRow = typeof fitments.$inferSelect;

export function customerView(row: CustomerRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    price_tier: row.priceTier,
    phone: row.phone,
    credit_limit_taka: takaOrNull(row.creditLimit),
    due_balance_taka: taka(row.dueBalance),
  };
}

export function supplierView(row: SupplierRow) {
  return { id: row.id, name: row.name, phone: row.phone, payable_balance_taka: taka(row.payableBalance) };
}

export function partView(row: PartRow, stock: string | null) {
  return {
    id: row.id,
    name_en: row.nameEn,
    name_bn: row.nameBn,
    quality: row.quality,
    position: row.position,
    unit: row.unit,
    rack_location: row.rackLocation,
    retail_price_taka: taka(row.retailPrice),
    garage_price_taka: takaOrNull(row.garagePrice),
    wholesale_price_taka: takaOrNull(row.wholesalePrice),
    stock_quantity: quantityNumber(stock ?? "0"),
    is_active: row.isActive,
  };
}

export function fitmentView(row: FitmentRow) {
  return {
    id: row.id,
    part_id: row.partId,
    vehicle_id: row.vehicleId,
    note: row.note,
    source: row.source,
    verified: row.verified,
    deleted: row.deletedAt !== null,
    updated_at: iso(row.updatedAt),
  };
}

export async function getCustomer(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)));
  if (!row) throw apiError("NOT_FOUND", { entity: "customer", id });
  return { customer: customerView(row) };
}

export async function getSupplier(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)));
  if (!row) throw apiError("NOT_FOUND", { entity: "supplier", id });
  return { supplier: supplierView(row) };
}

export async function getPart(tx: Tx, id: string) {
  const [row] = await tx
    .select({ part: parts, stock: stockLevels.quantity })
    .from(parts)
    .leftJoin(stockLevels, eq(stockLevels.partId, parts.id))
    .where(and(eq(parts.id, id), isNull(parts.deletedAt)));
  if (!row) throw apiError("NOT_FOUND", { entity: "part", id });
  return { part: partView(row.part, row.stock) };
}

export async function getFitment(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(fitments)
    .where(and(eq(fitments.id, id), isNull(fitments.deletedAt)));
  if (!row) throw apiError("NOT_FOUND", { entity: "fitment", id });
  return { fitment: fitmentView(row) };
}
