import { uuidv7 } from "@geargrid/core";
import { fitments, parts, vehicles } from "@geargrid/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { apiError } from "../http/errors";
import { takaOrNull, taka } from "../http/json";
import type { Answer, Context } from "../http/pipeline";
import { audit, changed } from "../posting";
import { fitmentView } from "./reads";

// Price changes and fitment links (spec 6.5): PATCH /parts/{id}/price, POST /fitments, PATCH /fitments/{id}. Only the
// row itself changes, plus the audit and change-log rows (spec 6.6).

export interface PriceInput {
  retail_price_taka?: number | undefined;
  garage_price_taka?: number | null | undefined;
}

type PartRow = typeof parts.$inferSelect;

const prices = (row: PartRow) => ({
  retail_price_taka: taka(row.retailPrice),
  garage_price_taka: takaOrNull(row.garagePrice),
});

/** `previous` is what an undo sends back (spec 6.5). */
export async function updatePrice({
  tx,
  actor,
  now,
  params,
  body,
}: Context<{ id: string }, undefined, PriceInput>): Promise<Answer> {
  const [part] = await tx
    .select()
    .from(parts)
    .where(and(eq(parts.id, params.id), isNull(parts.deletedAt)))
    .for("update");
  if (!part) throw apiError("NOT_FOUND", { entity: "part", id: params.id });
  const previous = prices(part);
  const change: Partial<typeof parts.$inferInsert> = {};
  if (body.retail_price_taka !== undefined) change.retailPrice = BigInt(body.retail_price_taka);
  if (body.garage_price_taka !== undefined) {
    change.garagePrice = body.garage_price_taka === null ? null : BigInt(body.garage_price_taka);
  }
  const [updated] = await tx
    .update(parts)
    .set({ ...change, updatedAt: now, version: sql`${parts.version} + 1` })
    .where(eq(parts.id, part.id))
    .returning();
  await changed(tx, "parts", part.id);
  const now_ = prices(updated!);
  await audit(tx, actor, "part.price_update", "part", part.id, previous, now_);
  return { status: 200, body: { part: { id: part.id, ...now_ }, previous } };
}

export interface FitmentInput {
  part_id: string;
  vehicle_id: string;
  note?: string | undefined;
  verified?: boolean | undefined;
}

export async function addFitment({
  tx,
  actor,
  now,
  body,
}: Context<undefined, undefined, FitmentInput>): Promise<Answer> {
  const [part] = await tx
    .select({ id: parts.id })
    .from(parts)
    .where(and(eq(parts.id, body.part_id), isNull(parts.deletedAt)));
  if (!part) throw apiError("NOT_FOUND", { entity: "part", id: body.part_id });
  const [vehicle] = await tx
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.id, body.vehicle_id), isNull(vehicles.deletedAt)));
  if (!vehicle) throw apiError("NOT_FOUND", { entity: "vehicle", id: body.vehicle_id });
  const [existing] = await tx
    .select({ id: fitments.id })
    .from(fitments)
    .where(and(eq(fitments.partId, part.id), eq(fitments.vehicleId, vehicle.id), isNull(fitments.deletedAt)));
  if (existing) throw apiError("FITMENT_EXISTS", { fitment_id: existing.id });
  const [row] = await tx
    .insert(fitments)
    .values({
      id: uuidv7(),
      partId: part.id,
      vehicleId: vehicle.id,
      note: body.note ?? null,
      source: actor.source === "ai" ? "ai" : "owner",
      verified: body.verified ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await changed(tx, "fitments", row!.id);
  const view = fitmentView(row!);
  await audit(tx, actor, "fitment.create", "fitment", row!.id, null, view);
  return { status: 201, body: { fitment: view } };
}

export interface FitmentChange {
  deleted?: true | undefined;
  note?: string | undefined;
  verified?: boolean | undefined;
}

/** Edit a link, or remove it with { deleted: true } (the undo of an add). */
export async function updateFitment({
  tx,
  actor,
  now,
  params,
  body,
}: Context<{ id: string }, undefined, FitmentChange>): Promise<Answer> {
  const [row] = await tx
    .select()
    .from(fitments)
    .where(and(eq(fitments.id, params.id), isNull(fitments.deletedAt)))
    .for("update");
  if (!row) throw apiError("NOT_FOUND", { entity: "fitment", id: params.id });
  const before = fitmentView(row);
  const [updated] = await tx
    .update(fitments)
    .set({
      ...(body.note !== undefined ? { note: body.note } : {}),
      ...(body.verified !== undefined ? { verified: body.verified } : {}),
      ...(body.deleted ? { deletedAt: now } : {}),
      updatedAt: now,
      version: sql`${fitments.version} + 1`,
    })
    .where(eq(fitments.id, row.id))
    .returning();
  await changed(tx, "fitments", row.id);
  const view = fitmentView(updated!);
  await audit(tx, actor, "fitment.update", "fitment", row.id, before, view);
  return { status: 200, body: { fitment: view } };
}
