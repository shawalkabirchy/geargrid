import { uuidv7 } from "@geargrid/core";
import { customerLedger, customers, supplierLedger, suppliers } from "@geargrid/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "../db";
import { apiError } from "../http/errors";
import type { Answer, Context } from "../http/pipeline";
import { audit, changed, type AuditActor } from "../posting";
import { customerView, supplierView } from "./reads";

// New customers and suppliers (spec 6.5, D173): POST /customers and /suppliers with a dry run, and PATCH
// /{id} to edit one or to remove it with { deleted: true }, the undo of an add. A record with a ledger row (a sale,
// payment, return or purchase) is never removed. Only the row itself changes, plus the audit and change-log rows.

export interface CustomerInput {
  name: string;
  type: "retail" | "garage";
  phone?: string | undefined;
  address?: string | undefined;
  credit_limit_taka?: number | null | undefined;
}

export interface SupplierInput {
  name: string;
  phone?: string | undefined;
  address?: string | undefined;
}

export interface PartyChange {
  deleted?: true | undefined;
  name?: string | undefined;
  phone?: string | undefined;
  address?: string | undefined;
}

/** The price tier follows the type (D144). */
export async function addCustomer({
  tx,
  actor,
  now,
  body,
  dryRun,
}: Context<undefined, undefined, CustomerInput, AuditActor>): Promise<Answer> {
  const [row] = await tx
    .insert(customers)
    .values({
      id: uuidv7(),
      name: body.name,
      type: body.type,
      priceTier: body.type,
      phone: body.phone ?? null,
      address: body.address ?? null,
      creditLimit:
        body.credit_limit_taka === undefined || body.credit_limit_taka === null
          ? null
          : BigInt(body.credit_limit_taka),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await changed(tx, "customers", row!.id);
  const view = customerView(row!);
  await audit(tx, actor, "customer.create", "customer", row!.id, null, view);
  return { status: dryRun ? 200 : 201, body: { customer: view, warnings: [], dry_run: dryRun } };
}

export async function addSupplier({
  tx,
  actor,
  now,
  body,
  dryRun,
}: Context<undefined, undefined, SupplierInput, AuditActor>): Promise<Answer> {
  const [row] = await tx
    .insert(suppliers)
    .values({
      id: uuidv7(),
      name: body.name,
      phone: body.phone ?? null,
      address: body.address ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await changed(tx, "suppliers", row!.id);
  const view = supplierView(row!);
  await audit(tx, actor, "supplier.create", "supplier", row!.id, null, view);
  return { status: dryRun ? 200 : 201, body: { supplier: view, warnings: [], dry_run: dryRun } };
}

const edits = (body: PartyChange, now: Date) => ({
  ...(body.name !== undefined ? { name: body.name } : {}),
  ...(body.phone !== undefined ? { phone: body.phone } : {}),
  ...(body.address !== undefined ? { address: body.address } : {}),
  ...(body.deleted ? { deletedAt: now } : {}),
  updatedAt: now,
});

export async function updateCustomer({
  tx,
  actor,
  now,
  params,
  body,
}: Context<{ id: string }, undefined, PartyChange, AuditActor>): Promise<Answer> {
  const [row] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.id, params.id), isNull(customers.deletedAt)))
    .for("update");
  if (!row) throw apiError("NOT_FOUND", { entity: "customer", id: params.id });
  if (body.deleted) {
    const [used] = await tx
      .select({ id: customerLedger.id })
      .from(customerLedger)
      .where(eq(customerLedger.customerId, row.id))
      .limit(1);
    if (used || row.dueBalance !== 0n || row.openingDue !== 0n)
      throw apiError("CUSTOMER_IN_USE", { customer_id: row.id });
  }
  const before = customerView(row);
  const [updated] = await tx
    .update(customers)
    .set({ ...edits(body, now), version: sql`${customers.version} + 1` })
    .where(eq(customers.id, row.id))
    .returning();
  await changed(tx, "customers", row.id);
  const view = customerView(updated!);
  await audit(tx, actor, "customer.update", "customer", row.id, before, view);
  return { status: 200, body: { customer: view } };
}

export async function updateSupplier({
  tx,
  actor,
  now,
  params,
  body,
}: Context<{ id: string }, undefined, PartyChange, AuditActor>): Promise<Answer> {
  const [row] = await tx
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, params.id), isNull(suppliers.deletedAt)))
    .for("update");
  if (!row) throw apiError("NOT_FOUND", { entity: "supplier", id: params.id });
  if (body.deleted) {
    const [used] = await tx
      .select({ id: supplierLedger.id })
      .from(supplierLedger)
      .where(eq(supplierLedger.supplierId, row.id))
      .limit(1);
    if (used || row.payableBalance !== 0n || row.openingPayable !== 0n)
      throw apiError("SUPPLIER_IN_USE", { supplier_id: row.id });
  }
  const before = supplierView(row);
  const [updated] = await tx
    .update(suppliers)
    .set({ ...edits(body, now), version: sql`${suppliers.version} + 1` })
    .where(eq(suppliers.id, row.id))
    .returning();
  await changed(tx, "suppliers", row.id);
  const view = supplierView(updated!);
  await audit(tx, actor, "supplier.update", "supplier", row.id, before, view);
  return { status: 200, body: { supplier: view } };
}

export interface CustomerEdit {
  name: string;
  phone: string | null;
  address: string | null;
  price_tier: "retail" | "garage";
  credit_limit_taka: number | null;
}

/**
 * The web dashboard's customer form (DokaanBondhu spec D193, C2): name, phone and address as PATCH does, plus the price
 * tier, which starts from the type and can be changed per customer (GearGrid plan 2.1), and the credit limit.
 */
export async function editCustomer(
  tx: Tx,
  actor: AuditActor,
  id: string,
  body: CustomerEdit,
  now = new Date(),
): Promise<void> {
  const [row] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .for("update");
  if (!row) throw apiError("NOT_FOUND", { entity: "customer", id });
  const before = customerView(row);
  const [updated] = await tx
    .update(customers)
    .set({
      name: body.name,
      phone: body.phone,
      address: body.address,
      priceTier: body.price_tier,
      creditLimit: body.credit_limit_taka === null ? null : BigInt(body.credit_limit_taka),
      updatedAt: now,
      version: sql`${customers.version} + 1`,
    })
    .where(eq(customers.id, row.id))
    .returning();
  await changed(tx, "customers", row.id);
  await audit(tx, actor, "customer.update", "customer", row.id, before, customerView(updated!));
}
