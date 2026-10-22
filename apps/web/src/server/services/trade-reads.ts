import type { Db } from "@geargrid/db";
import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "../db";

// Sales, purchases and payments as the web dashboard reads them (GearGrid plan 2.4-2.7, 8.1): the lists, one sale with
// its lines, payments and returns (and what is still returnable per line), one purchase, a customer's payments and the
// accounts a payment can go to.

type Reader = Db | Tx;

export const LIST_LIMIT = 200;

const like = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export type AccountOption = { id: string; name: string; kind: string };

export async function accountOptions(db: Reader): Promise<AccountOption[]> {
  const result = await db.execute<AccountOption>(sql`
    select id, name, kind from accounts where deleted_at is null and is_active
    order by case kind when 'cash' then 0 when 'bkash' then 1 when 'nagad' then 2 when 'rocket' then 3 else 4 end,
             name`);
  return result.rows;
}

export type SaleRow = {
  id: string;
  invoice_no: string;
  sale_time: Date;
  customer: string | null;
  total: string;
  paid: string;
  due: string;
  status: string;
};

/** Sales between two instants (newest first), optionally matching an invoice number or a customer's name. */
export async function listSales(db: Reader, from: Date, to: Date, query = ""): Promise<SaleRow[]> {
  const match: SQL = query
    ? sql`(s.invoice_no ilike ${like(query)} or coalesce(c.name, '') ilike ${like(query)})`
    : sql`true`;
  const result = await db.execute<SaleRow>(sql`
    select s.id, s.invoice_no, s.sale_time, c.name as customer, s.total, s.paid, s.due, s.status
    from sales s left join customers c on c.id = s.customer_id
    where s.deleted_at is null and s.sale_time >= ${from} and s.sale_time < ${to} and ${match}
    order by s.sale_time desc
    limit ${LIST_LIMIT}`);
  return result.rows.map((row) => ({ ...row, sale_time: new Date(row.sale_time) }));
}

export type SaleDetail = {
  sale: {
    id: string;
    invoice_no: string;
    sale_time: Date;
    customer_id: string | null;
    customer: string | null;
    customer_phone: string | null;
    customer_due: string | null;
    subtotal: string;
    discount: string;
    round_off: string;
    total: string;
    paid: string;
    due: string;
    status: string;
    void_reason: string | null;
    flags: string[];
    note: string | null;
  };
  items: {
    id: string;
    part_id: string;
    name_en: string;
    name_bn: string | null;
    number: string | null;
    unit: string;
    quantity: string;
    unit_price: string;
    list_price: string;
    line_total: string;
    returned: string;
  }[];
  payments: { id: string; method: string; amount: string; account: string | null; trx_id: string | null }[];
  returns: {
    id: string;
    return_time: Date;
    total: string;
    refund_due: string;
    refund_cash: string;
    reason: string | null;
  }[];
};

export async function saleDetail(db: Reader, id: string): Promise<SaleDetail | null> {
  const [sale] = (
    await db.execute<SaleDetail["sale"]>(sql`
    select s.id, s.invoice_no, s.sale_time, s.customer_id, c.name as customer, c.phone as customer_phone,
           c.due_balance as customer_due, s.subtotal, s.discount, s.round_off, s.total, s.paid, s.due, s.status,
           s.void_reason, s.flags, s.note
    from sales s left join customers c on c.id = s.customer_id
    where s.id = ${id} and s.deleted_at is null`)
  ).rows;
  if (!sale) return null;
  const items = await db.execute<SaleDetail["items"][number]>(sql`
    select i.id, i.part_id, p.name_en, p.name_bn, p.unit, i.quantity, i.unit_price, i.list_price, i.line_total,
           (select n.number from part_numbers n where n.part_id = p.id and n.deleted_at is null
            order by n.is_main desc, n.created_at limit 1) as number,
           coalesce((select sum(ri.quantity) from return_items ri where ri.sale_item_id = i.id
                     and ri.deleted_at is null), 0) as returned
    from sale_items i join parts p on p.id = i.part_id
    where i.sale_id = ${id} and i.deleted_at is null
    order by i.id`);
  const payments = await db.execute<SaleDetail["payments"][number]>(sql`
    select sp.id, sp.method, sp.amount, a.name as account, sp.trx_id
    from sale_payments sp left join accounts a on a.id = sp.account_id
    where sp.sale_id = ${id} and sp.deleted_at is null
    order by sp.id`);
  const returns = await db.execute<SaleDetail["returns"][number]>(sql`
    select id, return_time, total, refund_due, refund_cash, reason from returns
    where sale_id = ${id} and deleted_at is null order by return_time`);
  return {
    sale: { ...sale, sale_time: new Date(sale.sale_time) },
    items: items.rows,
    payments: payments.rows,
    returns: returns.rows.map((row) => ({ ...row, return_time: new Date(row.return_time) })),
  };
}

export type PurchaseRow = {
  id: string;
  bill_no: string | null;
  purchase_time: Date;
  supplier: string;
  total: string;
  paid: string;
  due: string;
  status: string;
};

export async function listPurchases(db: Reader, from: Date, to: Date, query = ""): Promise<PurchaseRow[]> {
  const match: SQL = query
    ? sql`(coalesce(p.bill_no, '') ilike ${like(query)} or s.name ilike ${like(query)})`
    : sql`true`;
  const result = await db.execute<PurchaseRow>(sql`
    select p.id, p.bill_no, p.purchase_time, s.name as supplier, p.total, p.paid, p.due, p.status
    from purchases p join suppliers s on s.id = p.supplier_id
    where p.deleted_at is null and p.purchase_time >= ${from} and p.purchase_time < ${to} and ${match}
    order by p.purchase_time desc
    limit ${LIST_LIMIT}`);
  return result.rows.map((row) => ({ ...row, purchase_time: new Date(row.purchase_time) }));
}

export type PurchaseDetail = {
  purchase: {
    id: string;
    bill_no: string | null;
    purchase_time: Date;
    supplier_id: string;
    supplier: string;
    total: string;
    paid: string;
    due: string;
    status: string;
    reversal_reason: string | null;
  };
  items: {
    id: string;
    part_id: string;
    name_en: string;
    name_bn: string | null;
    unit: string;
    quantity: string;
    unit_cost: string;
    line_total: string;
  }[];
  payments: { id: string; method: string; amount: string; account: string | null }[];
};

export async function purchaseDetail(db: Reader, id: string): Promise<PurchaseDetail | null> {
  const [purchase] = (
    await db.execute<PurchaseDetail["purchase"]>(sql`
    select p.id, p.bill_no, p.purchase_time, p.supplier_id, s.name as supplier, p.total, p.paid, p.due, p.status,
           p.reversal_reason
    from purchases p join suppliers s on s.id = p.supplier_id
    where p.id = ${id} and p.deleted_at is null`)
  ).rows;
  if (!purchase) return null;
  const items = await db.execute<PurchaseDetail["items"][number]>(sql`
    select i.id, i.part_id, pt.name_en, pt.name_bn, pt.unit, i.quantity, i.unit_cost, i.line_total
    from purchase_items i join parts pt on pt.id = i.part_id
    where i.purchase_id = ${id} and i.deleted_at is null
    order by i.created_at, i.id`);
  const payments = await db.execute<PurchaseDetail["payments"][number]>(sql`
    select sp.id, sp.method, sp.amount, a.name as account
    from supplier_payments sp left join accounts a on a.id = sp.account_id
    where sp.purchase_id = ${id} and sp.deleted_at is null
    order by sp.id`);
  return {
    purchase: { ...purchase, purchase_time: new Date(purchase.purchase_time) },
    items: items.rows,
    payments: payments.rows,
  };
}

export type CustomerPaymentRow = {
  id: string;
  received_at: Date;
  amount: string;
  method: string;
  account: string | null;
  trx_id: string | null;
  status: string;
  reversal_reason: string | null;
};

export async function customerPaymentList(db: Reader, customerId: string): Promise<CustomerPaymentRow[]> {
  const result = await db.execute<CustomerPaymentRow>(sql`
    select cp.id, cp.received_at, cp.amount, cp.method, a.name as account, cp.trx_id, cp.status, cp.reversal_reason
    from customer_payments cp left join accounts a on a.id = cp.account_id
    where cp.customer_id = ${customerId} and cp.deleted_at is null
    order by cp.received_at desc
    limit 50`);
  return result.rows.map((row) => ({ ...row, received_at: new Date(row.received_at) }));
}
