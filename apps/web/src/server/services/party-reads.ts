import type { Db } from "@geargrid/db";
import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "../db";

// Customers and suppliers as the web dashboard reads them (GearGrid plan 2.5, 2.7, 8.1): the lists with what each owes
// or is owed, and one party's ledger with its running balance. A ledger line names its bill: the sale's invoice number
// (for a sale, its payment, its void or a return of it) or the supplier's bill number.

type Reader = Db | Tx;

export const LEDGER_LIMIT = 200;

const like = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function nameOrPhone(query: string, table: "c" | "s"): SQL {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length === 0) return sql`true`;
  const t = sql.raw(table);
  return sql.join(
    words.map((word) => sql`(${t}.name ilike ${like(word)} or coalesce(${t}.phone, '') ilike ${like(word)})`),
    sql` and `,
  );
}

export type CustomerRow = {
  id: string;
  name: string;
  type: string;
  price_tier: string;
  phone: string | null;
  address: string | null;
  credit_limit: string | null;
  due_balance: string;
};

export async function listCustomers(db: Reader, query = ""): Promise<CustomerRow[]> {
  const result = await db.execute<CustomerRow>(sql`
    select c.id, c.name, c.type, c.price_tier, c.phone, c.address, c.credit_limit, c.due_balance
    from customers c where c.deleted_at is null and ${nameOrPhone(query, "c")}
    order by c.due_balance desc, c.name`);
  return result.rows;
}

export type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  payable_balance: string;
};

export async function listSuppliers(db: Reader, query = ""): Promise<SupplierRow[]> {
  const result = await db.execute<SupplierRow>(sql`
    select s.id, s.name, s.phone, s.address, s.payable_balance
    from suppliers s where s.deleted_at is null and ${nameOrPhone(query, "s")}
    order by s.payable_balance desc, s.name`);
  return result.rows;
}

export type LedgerLine = {
  id: string;
  created_at: Date;
  entry_type: string;
  reference: string | null;
  debit: string;
  credit: string;
  balance_after: string;
};

/** The newest lines first, at most LEDGER_LIMIT, plus whether older ones were left out. */
export interface Ledger {
  lines: LedgerLine[];
  more: boolean;
}

function ledger(rows: LedgerLine[]): Ledger {
  return {
    lines: rows.slice(0, LEDGER_LIMIT).map((row) => ({ ...row, created_at: new Date(row.created_at) })),
    more: rows.length > LEDGER_LIMIT,
  };
}

export async function customerDetail(
  db: Reader,
  id: string,
): Promise<{ customer: CustomerRow; ledger: Ledger; hasHistory: boolean } | null> {
  const [customer] = (
    await db.execute<CustomerRow>(sql`
    select id, name, type, price_tier, phone, address, credit_limit, due_balance
    from customers where id = ${id} and deleted_at is null`)
  ).rows;
  if (!customer) return null;
  const rows = await db.execute<LedgerLine>(sql`
    select l.id, l.created_at, l.entry_type, l.debit, l.credit, l.balance_after,
           coalesce(s.invoice_no, rs.invoice_no) as reference
    from customer_ledger l
    left join sales s on l.ref_type in ('sale', 'sale_payment', 'void', 'void_payment') and s.id = l.ref_id
    left join returns r on l.ref_type = 'return' and r.id = l.ref_id
    left join sales rs on rs.id = r.sale_id
    where l.customer_id = ${id} and l.deleted_at is null
    order by l.seq desc
    limit ${LEDGER_LIMIT + 1}`);
  return { customer, ledger: ledger(rows.rows), hasHistory: rows.rows.length > 0 };
}

export async function supplierDetail(
  db: Reader,
  id: string,
): Promise<{ supplier: SupplierRow; ledger: Ledger; hasHistory: boolean } | null> {
  const [supplier] = (
    await db.execute<SupplierRow>(sql`
    select id, name, phone, address, payable_balance from suppliers where id = ${id} and deleted_at is null`)
  ).rows;
  if (!supplier) return null;
  const rows = await db.execute<LedgerLine>(sql`
    select l.id, l.created_at, l.entry_type, l.debit, l.credit, l.balance_after, p.bill_no as reference
    from supplier_ledger l
    left join purchases p on l.ref_type in ('purchase', 'purchase_payment', 'purchase_reversal') and p.id = l.ref_id
    where l.supplier_id = ${id} and l.deleted_at is null
    order by l.seq desc
    limit ${LEDGER_LIMIT + 1}`);
  return { supplier, ledger: ledger(rows.rows), hasHistory: rows.rows.length > 0 };
}
