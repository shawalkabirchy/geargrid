import { AppError, formatQuantity, parseQuantity, uuidv7 } from "@geargrid/core";
import {
  PART_NUMBER_KINDS,
  PART_POSITIONS,
  PART_QUALITIES,
  PART_UNITS,
  PART_VEHICLE_TYPES,
  VEHICLE_TYPES,
  brands,
  partAliases,
  partNumbers,
  parts,
  stockLevels,
  vehicles,
} from "@geargrid/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "../db";
import { apiError } from "../http/errors";
import { audit, changed, type AuditActor } from "../posting";
import { normalizePartNumber } from "./catalog-reads";

// Catalog changes made on the web dashboard (GearGrid plan 2.1, 2.2, 2.3; DokaanBondhu spec D193, C2): a new part, a
// part's record, its numbers and shop words, and new vehicles. Each is one transaction with its audit and change-log
// rows. A new part starts with no stock: stock comes in by a purchase or a stock count. The average cost is never
// edited; purchases set it.

/** A refusal that only the web shows; its message is a web label (`web.<code>`). */
export function webError(code: string, details?: Record<string, unknown>): AppError {
  return new AppError(code, 409, `web.${code}`, details);
}

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));
const taka = z.number().int().nonnegative().max(100_000_000);
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/);

export const partInput = z.object({
  nameEn: text(150),
  nameBn: optionalText(150),
  categoryId: z.uuid(),
  brandId: z.uuid().nullable(),
  newBrand: optionalText(60),
  vehicleType: z.enum(PART_VEHICLE_TYPES),
  quality: z.enum(PART_QUALITIES),
  position: z.enum(PART_POSITIONS).nullable(),
  unit: z.enum(PART_UNITS),
  packSize: quantity.nullable(),
  rackLocation: optionalText(20),
  retailPrice: taka,
  garagePrice: taka.nullable(),
  reorderLevel: quantity,
  notes: optionalText(500),
  isActive: z.boolean(),
});
export type PartInput = z.infer<typeof partInput>;

type PartRow = typeof parts.$inferSelect;

const qty = (value: string | null) => (value === null ? null : formatQuantity(parseQuantity(value)));

export function partRecord(row: PartRow) {
  return {
    name_en: row.nameEn,
    name_bn: row.nameBn,
    category_id: row.categoryId,
    brand_id: row.brandId,
    vehicle_type: row.vehicleType,
    quality: row.quality,
    position: row.position,
    unit: row.unit,
    pack_size: row.packSize,
    rack_location: row.rackLocation,
    retail_price_taka: Number(row.retailPrice),
    garage_price_taka: row.garagePrice === null ? null : Number(row.garagePrice),
    reorder_level: row.reorderLevel,
    notes: row.notes,
    is_active: row.isActive,
  };
}

/** The brand chosen, or a new one by its name (an existing brand of that name is reused). */
async function brandFor(tx: Tx, actor: AuditActor, input: PartInput, now: Date): Promise<string | null> {
  if (!input.newBrand) return input.brandId;
  const [existing] = await tx
    .select({ id: brands.id })
    .from(brands)
    .where(and(sql`lower(${brands.name}) = lower(${input.newBrand})`, isNull(brands.deletedAt)));
  if (existing) return existing.id;
  const [row] = await tx
    .insert(brands)
    .values({ id: uuidv7(), name: input.newBrand, createdAt: now, updatedAt: now })
    .returning();
  await changed(tx, "brands", row!.id);
  await audit(tx, actor, "brand.create", "brand", row!.id, null, { name: row!.name });
  return row!.id;
}

function columns(input: PartInput, brandId: string | null) {
  return {
    nameEn: input.nameEn,
    nameBn: input.nameBn,
    categoryId: input.categoryId,
    brandId,
    vehicleType: input.vehicleType,
    quality: input.quality,
    position: input.position,
    unit: input.unit,
    packSize: qty(input.packSize),
    rackLocation: input.rackLocation,
    retailPrice: BigInt(input.retailPrice),
    garagePrice: input.garagePrice === null ? null : BigInt(input.garagePrice),
    reorderLevel: formatQuantity(parseQuantity(input.reorderLevel)),
    notes: input.notes,
    isActive: input.isActive,
  };
}

export async function createPart(
  tx: Tx,
  actor: AuditActor,
  input: PartInput,
  mainNumber: string | null,
  now = new Date(),
): Promise<string> {
  const brandId = await brandFor(tx, actor, input, now);
  const [row] = await tx
    .insert(parts)
    .values({ id: uuidv7(), ...columns(input, brandId), createdAt: now, updatedAt: now })
    .returning();
  const id = row!.id;
  await tx.insert(stockLevels).values({ partId: id, quantity: "0", updatedAt: now });
  await changed(tx, "parts", id);
  await changed(tx, "stock_levels", id);
  await audit(tx, actor, "part.create", "part", id, null, partRecord(row!));
  if (mainNumber)
    await addPartNumber(tx, actor, id, { number: mainNumber, kind: "oem", brand: null, isMain: true }, now);
  return id;
}

export async function updatePart(
  tx: Tx,
  actor: AuditActor,
  id: string,
  input: PartInput,
  now = new Date(),
): Promise<void> {
  const [before] = await tx
    .select()
    .from(parts)
    .where(and(eq(parts.id, id), isNull(parts.deletedAt)))
    .for("update");
  if (!before) throw apiError("NOT_FOUND", { entity: "part", id });
  const brandId = await brandFor(tx, actor, input, now);
  const [after] = await tx
    .update(parts)
    .set({ ...columns(input, brandId), updatedAt: now, version: sql`${parts.version} + 1` })
    .where(eq(parts.id, id))
    .returning();
  await changed(tx, "parts", id);
  await audit(tx, actor, "part.update", "part", id, partRecord(before), partRecord(after!));
}

export const partNumberInput = z.object({
  number: text(40),
  kind: z.enum(PART_NUMBER_KINDS),
  brand: optionalText(60),
  isMain: z.boolean(),
});
export type PartNumberInput = z.infer<typeof partNumberInput>;

/** A number already on this part is refused; a new main number takes over from the old one. */
export async function addPartNumber(
  tx: Tx,
  actor: AuditActor,
  partId: string,
  input: PartNumberInput,
  now = new Date(),
): Promise<void> {
  const [part] = await tx
    .select({ id: parts.id })
    .from(parts)
    .where(and(eq(parts.id, partId), isNull(parts.deletedAt)))
    .for("update");
  if (!part) throw apiError("NOT_FOUND", { entity: "part", id: partId });
  const normalized = normalizePartNumber(input.number);
  const [same] = await tx
    .select({ id: partNumbers.id })
    .from(partNumbers)
    .where(
      and(
        eq(partNumbers.partId, partId),
        eq(partNumbers.numberNormalized, normalized),
        isNull(partNumbers.deletedAt),
      ),
    );
  if (same) throw webError("NUMBER_EXISTS");
  if (input.isMain) {
    const old = await tx
      .update(partNumbers)
      .set({ isMain: false, updatedAt: now, version: sql`${partNumbers.version} + 1` })
      .where(and(eq(partNumbers.partId, partId), eq(partNumbers.isMain, true), isNull(partNumbers.deletedAt)))
      .returning({ id: partNumbers.id });
    await changed(tx, "part_numbers", ...old.map((row) => row.id));
  }
  const [row] = await tx
    .insert(partNumbers)
    .values({
      id: uuidv7(),
      partId,
      number: input.number,
      numberNormalized: normalized,
      kind: input.kind,
      brand: input.brand,
      isMain: input.isMain,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await changed(tx, "part_numbers", row!.id);
  await audit(tx, actor, "part_number.create", "part_number", row!.id, null, {
    part_id: partId,
    number: row!.number,
    kind: row!.kind,
    is_main: row!.isMain,
  });
}

export async function removePartNumber(
  tx: Tx,
  actor: AuditActor,
  id: string,
  now = new Date(),
): Promise<void> {
  const [row] = await tx
    .update(partNumbers)
    .set({ deletedAt: now, isMain: false, updatedAt: now, version: sql`${partNumbers.version} + 1` })
    .where(and(eq(partNumbers.id, id), isNull(partNumbers.deletedAt)))
    .returning();
  if (!row) throw apiError("NOT_FOUND", { entity: "part_number", id });
  await changed(tx, "part_numbers", id);
  await audit(
    tx,
    actor,
    "part_number.delete",
    "part_number",
    id,
    { part_id: row.partId, number: row.number },
    null,
  );
}

export const aliasInput = z
  .object({
    aliasText: text(60),
    partId: z.uuid().nullable(),
    categoryId: z.uuid().nullable(),
  })
  .refine((value) => (value.partId === null) !== (value.categoryId === null), { path: ["categoryId"] });
export type AliasInput = z.infer<typeof aliasInput>;

/** A shop word for one part or for a whole category; the same word twice for the same target is refused. */
export async function addAlias(
  tx: Tx,
  actor: AuditActor,
  input: AliasInput,
  now = new Date(),
): Promise<void> {
  const target = input.partId
    ? eq(partAliases.partId, input.partId)
    : eq(partAliases.categoryId, input.categoryId!);
  const [same] = await tx
    .select({ id: partAliases.id })
    .from(partAliases)
    .where(
      and(
        target,
        sql`lower(${partAliases.aliasText}) = lower(${input.aliasText})`,
        isNull(partAliases.deletedAt),
      ),
    );
  if (same) throw webError("ALIAS_EXISTS");
  const [row] = await tx
    .insert(partAliases)
    .values({
      id: uuidv7(),
      partId: input.partId,
      categoryId: input.categoryId,
      aliasText: input.aliasText,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await changed(tx, "part_aliases", row!.id);
  await audit(tx, actor, "alias.create", "part_alias", row!.id, null, {
    alias_text: row!.aliasText,
    part_id: row!.partId,
    category_id: row!.categoryId,
  });
}

export async function removeAlias(tx: Tx, actor: AuditActor, id: string, now = new Date()): Promise<void> {
  const [row] = await tx
    .update(partAliases)
    .set({ deletedAt: now, updatedAt: now, version: sql`${partAliases.version} + 1` })
    .where(and(eq(partAliases.id, id), isNull(partAliases.deletedAt)))
    .returning();
  if (!row) throw apiError("NOT_FOUND", { entity: "part_alias", id });
  await changed(tx, "part_aliases", id);
  await audit(tx, actor, "alias.delete", "part_alias", id, { alias_text: row.aliasText }, null);
}

const thisYear = () => new Date().getUTCFullYear();

export const vehicleInput = z
  .object({
    vehicleType: z.enum(VEHICLE_TYPES),
    make: text(40),
    model: text(60),
    yearFrom: z.number().int().min(1950),
    yearTo: z.number().int().nullable(),
    engineCode: optionalText(30),
    body: optionalText(30),
  })
  .refine((value) => value.yearFrom <= thisYear() + 1, { path: ["yearFrom"] })
  .refine(
    (value) => value.yearTo === null || (value.yearTo >= value.yearFrom && value.yearTo <= thisYear() + 1),
    {
      path: ["yearTo"],
    },
  );
export type VehicleInput = z.infer<typeof vehicleInput>;

/** A vehicle the shop adds (source "shop"); the same make, model, first year and engine twice is refused. */
export async function addVehicle(
  tx: Tx,
  actor: AuditActor,
  input: VehicleInput,
  now = new Date(),
): Promise<string> {
  const [same] = await tx
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(
      and(
        sql`lower(${vehicles.make}) = lower(${input.make})`,
        sql`lower(${vehicles.model}) = lower(${input.model})`,
        eq(vehicles.yearFrom, input.yearFrom),
        sql`coalesce(lower(${vehicles.engineCode}), '') = lower(${input.engineCode ?? ""})`,
        isNull(vehicles.deletedAt),
      ),
    );
  if (same) throw webError("VEHICLE_EXISTS");
  const [row] = await tx
    .insert(vehicles)
    .values({ id: uuidv7(), ...input, source: "shop", createdAt: now, updatedAt: now })
    .returning();
  await changed(tx, "vehicles", row!.id);
  await audit(tx, actor, "vehicle.create", "vehicle", row!.id, null, {
    make: row!.make,
    model: row!.model,
    year_from: row!.yearFrom,
    year_to: row!.yearTo,
    engine_code: row!.engineCode,
  });
  return row!.id;
}
