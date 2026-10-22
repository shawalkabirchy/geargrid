import { AUDIT_LOG_SOURCES, type Db } from "@geargrid/db";
import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "../db";

// The history of changes (GearGrid plan 2.12 "Audit log and history"; DokaanBondhu spec D193, C5): who changed what,
// when and from where — the web dashboard, an API key, DokaanBondhu AI or the phone — with the old and new values.
// Newest first, 100 at a time; a record's own page links here for its history.

type Reader = Db | Tx;

export const AUDIT_PAGE = 100;

export type AuditFilter = {
  source: (typeof AUDIT_LOG_SOURCES)[number] | null;
  entity: string | null;
  entityId: string | null;
  /** Rows older than this audit row (the next page). */
  before: string | null;
};

export type AuditRow = {
  id: string;
  created_at: Date;
  source: string;
  action: string;
  entity: string;
  entity_id: string | null;
  acting_user: string | null;
  user_name: string | null;
  key_name: string | null;
  before: unknown;
  after: unknown;
};

export async function auditLog(
  db: Reader,
  filter: AuditFilter,
): Promise<{ rows: AuditRow[]; more: boolean }> {
  const where: SQL[] = [sql`true`];
  if (filter.source) where.push(sql`a.source = ${filter.source}`);
  if (filter.entity) where.push(sql`a.entity = ${filter.entity}`);
  if (filter.entityId) where.push(sql`a.entity_id = ${filter.entityId}::uuid`);
  if (filter.before && /^\d+$/.test(filter.before)) where.push(sql`a.id < ${filter.before}::bigint`);
  const result = await db.execute<AuditRow>(sql`
    select a.id::text as id, a.created_at, a.source, a.action, a.entity, a.entity_id, a.acting_user,
           u.name as user_name, k.name as key_name, a.before, a.after
    from audit_logs a
    left join users u on u.id = a.user_id
    left join api_keys k on k.id = a.api_key_id
    where ${sql.join(where, sql` and `)}
    order by a.id desc
    limit ${AUDIT_PAGE + 1}`);
  return {
    rows: result.rows.slice(0, AUDIT_PAGE).map((row) => ({ ...row, created_at: new Date(row.created_at) })),
    more: result.rows.length > AUDIT_PAGE,
  };
}

/** The entities the log has rows for, for the filter. */
export async function auditEntities(db: Reader): Promise<string[]> {
  const result = await db.execute<{ entity: string }>(
    sql`select distinct entity from audit_logs order by entity`,
  );
  return result.rows.map((row) => row.entity);
}

/** A record's own page, when it has one. */
export function entityLink(entity: string, id: string | null, after: unknown): string | null {
  if (!id) return null;
  const pages: Record<string, string> = {
    sale: "/sales/",
    part: "/parts/",
    customer: "/customers/",
    supplier: "/suppliers/",
    purchase: "/purchases/",
    account: "/money/",
    import_job: "/import/",
  };
  if (pages[entity]) return `${pages[entity]}${id}`;
  const value = (after ?? {}) as Record<string, unknown>;
  if (entity === "fitment" && typeof value.part_id === "string") return `/parts/${value.part_id}`;
  if (entity === "return" && typeof value.sale_id === "string") return `/sales/${value.sale_id}`;
  if (entity === "customer_payment" && typeof value.customer_id === "string")
    return `/customers/${value.customer_id}`;
  if (entity === "supplier_payment" && typeof value.supplier_id === "string")
    return `/suppliers/${value.supplier_id}`;
  return null;
}
