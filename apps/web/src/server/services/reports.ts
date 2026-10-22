import { addDays } from "@geargrid/core";
import type { Db } from "@geargrid/db";
import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "../db";

// The reports (GearGrid plan 2.11; DokaanBondhu spec D193, C5), as numbers: profit and loss, sales by part, category,
// brand or car model, customer dues by age, statements, stock on hand and expenses by category. Every range is in
// Dhaka days, `from` to `to` inclusive. The pages and the Excel export show the same numbers.
//
// Profit (GearGrid plan 2.8): sales minus their cost (the average cost saved on each sale line) minus returns minus
// expenses. A return takes its value off and gives back the cost of what went back on the shelf (restock "yes");
// damaged goods give nothing back. A voided sale counts nowhere. Home's today figures use the same function.

type Reader = Db | Tx;

/** The instant a Dhaka day starts. */
export const dhakaStart = (date: string) => new Date(`${date}T00:00:00+06:00`);

const big = (value: string | null | undefined) => BigInt(value ?? "0");

export type ProfitAndLoss = {
  salesCount: number;
  sales: bigint;
  cost: bigint;
  gross: bigint;
  returns: bigint;
  returnedCost: bigint;
  expenses: bigint;
  expensesByCategory: { name_en: string; name_bn: string | null; amount: bigint }[];
  net: bigint;
};

const SOLD = (start: Date, end: Date) => sql`
  select count(*) as count, coalesce(sum(s.total), 0) as total,
         coalesce(sum((select sum(round(i.quantity * i.unit_cost_at_sale))
                       from sale_items i where i.sale_id = s.id and i.deleted_at is null)), 0) as cost
  from sales s
  where s.status = 'completed' and s.deleted_at is null and s.sale_time >= ${start} and s.sale_time < ${end}`;

const RETURNED = (start: Date, end: Date) => sql`
  select coalesce(sum(r.total), 0) as total,
         coalesce(sum((select sum(round(ri.quantity * si.unit_cost_at_sale))
                       from return_items ri join sale_items si on si.id = ri.sale_item_id
                       where ri.return_id = r.id and ri.restock = 'yes' and ri.deleted_at is null)), 0) as cost
  from returns r
  where r.deleted_at is null and r.return_time >= ${start} and r.return_time < ${end}`;

/** Profit and loss between two instants. */
export async function profitAndLoss(db: Reader, start: Date, end: Date): Promise<ProfitAndLoss> {
  const [sold] = (await db.execute<{ count: string; total: string; cost: string }>(SOLD(start, end))).rows;
  const [returned] = (await db.execute<{ total: string; cost: string }>(RETURNED(start, end))).rows;
  const byCategory = await db.execute<{ name_en: string; name_bn: string | null; amount: string }>(sql`
    select c.name_en, c.name_bn, sum(e.amount) as amount
    from expenses e join expense_categories c on c.id = e.category_id
    where e.deleted_at is null and e.spent_at >= ${start} and e.spent_at < ${end}
    group by c.id order by sum(e.amount) desc`);
  const expensesByCategory = byCategory.rows.map((row) => ({ ...row, amount: BigInt(row.amount) }));
  const sales = big(sold?.total);
  const cost = big(sold?.cost);
  const returns = big(returned?.total);
  const returnedCost = big(returned?.cost);
  const expenses = expensesByCategory.reduce((sum, row) => sum + row.amount, 0n);
  return {
    salesCount: Number(sold?.count ?? 0),
    sales,
    cost,
    gross: sales - cost,
    returns,
    returnedCost,
    expenses,
    expensesByCategory,
    net: sales - cost - (returns - returnedCost) - expenses,
  };
}

export type PeriodProfit = {
  period: string;
  sales: bigint;
  cost: bigint;
  returns: bigint;
  expenses: bigint;
  net: bigint;
};

/**
 * Profit and loss of each day (or each month) of a range, every period listed even when nothing happened. A day is
 * yyyy-mm-dd, a month yyyy-mm.
 */
export async function profitByPeriod(
  db: Reader,
  from: string,
  to: string,
  unit: "day" | "month",
): Promise<PeriodProfit[]> {
  const fmt = unit === "day" ? "YYYY-MM-DD" : "YYYY-MM";
  const local = (column: SQL) => sql`to_char(${column} at time zone 'Asia/Dhaka', ${fmt})`;
  const start = dhakaStart(from);
  const end = dhakaStart(addDays(to, 1));
  const result = await db.execute<{
    period: string;
    sales: string | null;
    cost: string | null;
    returns: string | null;
    returned_cost: string | null;
    expenses: string | null;
  }>(sql`
    with periods as (
      select distinct to_char(d, ${fmt}) as period
      from generate_series(${from}::date, ${to}::date, interval '1 day') d
    ),
    s as (
      select ${local(sql`s.sale_time`)} as period, sum(s.total) as sales,
             sum((select sum(round(i.quantity * i.unit_cost_at_sale)) from sale_items i
                  where i.sale_id = s.id and i.deleted_at is null)) as cost
      from sales s
      where s.status = 'completed' and s.deleted_at is null and s.sale_time >= ${start} and s.sale_time < ${end}
      group by 1
    ),
    r as (
      select ${local(sql`r.return_time`)} as period, sum(r.total) as returns,
             sum((select sum(round(ri.quantity * si.unit_cost_at_sale))
                  from return_items ri join sale_items si on si.id = ri.sale_item_id
                  where ri.return_id = r.id and ri.restock = 'yes' and ri.deleted_at is null)) as returned_cost
      from returns r
      where r.deleted_at is null and r.return_time >= ${start} and r.return_time < ${end}
      group by 1
    ),
    e as (
      select ${local(sql`e.spent_at`)} as period, sum(e.amount) as expenses
      from expenses e
      where e.deleted_at is null and e.spent_at >= ${start} and e.spent_at < ${end}
      group by 1
    )
    select p.period, s.sales, s.cost, r.returns, r.returned_cost, e.expenses
    from periods p
    left join s on s.period = p.period
    left join r on r.period = p.period
    left join e on e.period = p.period
    order by p.period`);
  return result.rows.map((row) => {
    const sales = big(row.sales);
    const cost = big(row.cost);
    const returns = big(row.returns) - big(row.returned_cost);
    const expenses = big(row.expenses);
    return { period: row.period, sales, cost, returns, expenses, net: sales - cost - returns - expenses };
  });
}

export type SalesBy = "part" | "category" | "brand" | "vehicle";

export type SalesByRow = {
  key: string;
  name: string;
  quantity: string;
  amount: bigint;
  cost: bigint;
  profit: bigint;
};

/**
 * Sales of a range grouped by part, category, brand or car model: quantity, amount and profit. A line's amount shares
 * out its bill's discount and round-off (its value × the bill's total ÷ its subtotal, as a return does, rule 10). By car
 * model, a part that fits several models counts under each, and a part with no fitment under none ("—").
 */
export async function salesBy(db: Reader, by: SalesBy, from: string, to: string): Promise<SalesByRow[]> {
  const start = dhakaStart(from);
  const end = dhakaStart(addDays(to, 1));
  const group: Record<SalesBy, { key: SQL; name: SQL; join: SQL }> = {
    part: { key: sql`p.id::text`, name: sql`coalesce(p.name_bn, p.name_en)`, join: sql`` },
    category: {
      key: sql`c.id::text`,
      name: sql`c.name_en || coalesce(' / ' || c.name_bn, '')`,
      join: sql`join categories c on c.id = p.category_id`,
    },
    brand: {
      key: sql`coalesce(b.id::text, '')`,
      name: sql`coalesce(b.name, '—')`,
      join: sql`left join brands b on b.id = p.brand_id`,
    },
    vehicle: {
      key: sql`coalesce(lower(v.make || ' ' || v.model), '')`,
      name: sql`coalesce(v.make || ' ' || v.model, '—')`,
      join: sql`left join (select distinct f.part_id, v.make, v.model from fitments f
                           join vehicles v on v.id = f.vehicle_id
                           where f.deleted_at is null and v.deleted_at is null) v on v.part_id = p.id`,
    },
  };
  const g = group[by];
  const result = await db.execute<{
    key: string;
    name: string;
    quantity: string;
    amount: string;
    cost: string;
  }>(sql`
    select ${g.key} as key, min(${g.name}) as name, sum(i.quantity) as quantity,
           sum(case when s.subtotal = 0 then 0 else round(i.line_total * s.total / s.subtotal::numeric) end) as amount,
           sum(round(i.quantity * i.unit_cost_at_sale)) as cost
    from sale_items i
    join sales s on s.id = i.sale_id
    join parts p on p.id = i.part_id
    ${g.join}
    where s.status = 'completed' and s.deleted_at is null and i.deleted_at is null
      and s.sale_time >= ${start} and s.sale_time < ${end}
    group by 1
    order by 4 desc, 2`);
  return result.rows.map((row) => {
    const amount = big(row.amount);
    const cost = big(row.cost);
    return { key: row.key, name: row.name, quantity: row.quantity, amount, cost, profit: amount - cost };
  });
}

export type AgingRow = {
  id: string;
  name: string;
  phone: string | null;
  due: bigint;
  d30: bigint;
  d60: bigint;
  d90: bigint;
  older: bigint;
  oldest: Date | null;
};

/**
 * Who owes how much and for how long (GearGrid plan 2.11): each customer's due is laid on their newest debits first
 * (what they still owe is what they bought last), and each part is aged from its entry's date: up to 30 days, 31-60,
 * 61-90 and older.
 */
export async function customerAging(db: Reader, now = new Date()): Promise<AgingRow[]> {
  const result = await db.execute<{
    id: string;
    name: string;
    phone: string | null;
    due: string;
    d30: string;
    d60: string;
    d90: string;
    older: string;
    oldest: Date | null;
  }>(sql`
    with d as (
      select l.customer_id, l.created_at, l.debit,
             sum(l.debit) over (partition by l.customer_id order by l.seq desc rows unbounded preceding) as upto
      from customer_ledger l where l.debit > 0 and l.deleted_at is null
    ),
    parts as (
      select d.customer_id, d.created_at,
             greatest(0, least(d.debit, c.due_balance - (d.upto - d.debit))) as amount,
             floor(extract(epoch from (${now}::timestamptz - d.created_at)) / 86400) as age
      from d join customers c on c.id = d.customer_id
      where c.due_balance > 0
    )
    select c.id, c.name, c.phone, c.due_balance as due,
           coalesce(sum(p.amount) filter (where p.age <= 30), 0) as d30,
           coalesce(sum(p.amount) filter (where p.age > 30 and p.age <= 60), 0) as d60,
           coalesce(sum(p.amount) filter (where p.age > 60 and p.age <= 90), 0) as d90,
           coalesce(sum(p.amount) filter (where p.age > 90), 0) as older,
           min(p.created_at) filter (where p.amount > 0) as oldest
    from customers c left join parts p on p.customer_id = c.id
    where c.deleted_at is null and c.due_balance > 0
    group by c.id
    order by c.due_balance desc, c.name`);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    due: big(row.due),
    d30: big(row.d30),
    d60: big(row.d60),
    d90: big(row.d90),
    older: big(row.older),
    oldest: row.oldest === null ? null : new Date(row.oldest),
  }));
}

export type StatementLine = {
  id: string;
  created_at: Date;
  entry_type: string;
  reference: string | null;
  debit: bigint;
  credit: bigint;
  balance_after: bigint;
};

export type Statement = { opening: bigint; lines: StatementLine[]; closing: bigint };

/** A customer's or a supplier's ledger for a range: the balance before it, every line in it, the balance after it. */
export async function statement(
  db: Reader,
  party: "customer" | "supplier",
  id: string,
  from: string,
  to: string,
): Promise<Statement> {
  const start = dhakaStart(from);
  const end = dhakaStart(addDays(to, 1));
  const ledger = sql.raw(party === "customer" ? "customer_ledger" : "supplier_ledger");
  const owner = sql.raw(party === "customer" ? "customer_id" : "supplier_id");
  const reference =
    party === "customer"
      ? sql`(select coalesce(s.invoice_no, rs.invoice_no) from (select 1) x
             left join sales s on l.ref_type = 'sale' and s.id = l.ref_id
             left join returns r on l.ref_type = 'return' and r.id = l.ref_id
             left join sales rs on rs.id = r.sale_id)`
      : sql`(select p.bill_no from purchases p where l.ref_type = 'purchase' and p.id = l.ref_id)`;
  const [before] = (
    await db.execute<{ balance: string | null }>(sql`
    select balance_after as balance from ${ledger} l
    where l.${owner} = ${id} and l.deleted_at is null and l.created_at < ${start}
    order by l.seq desc limit 1`)
  ).rows;
  const rows = await db.execute<{
    id: string;
    created_at: Date;
    entry_type: string;
    reference: string | null;
    debit: string;
    credit: string;
    balance_after: string;
  }>(sql`
    select l.id, l.created_at, l.entry_type, ${reference} as reference, l.debit, l.credit, l.balance_after
    from ${ledger} l
    where l.${owner} = ${id} and l.deleted_at is null and l.created_at >= ${start} and l.created_at < ${end}
    order by l.seq`);
  const lines = rows.rows.map((row) => ({
    ...row,
    created_at: new Date(row.created_at),
    debit: BigInt(row.debit),
    credit: BigInt(row.credit),
    balance_after: BigInt(row.balance_after),
  }));
  const opening = big(before?.balance);
  return { opening, lines, closing: lines.at(-1)?.balance_after ?? opening };
}

export type StockOnHandRow = {
  id: string;
  name: string;
  number: string | null;
  rack_location: string | null;
  unit: string;
  quantity: string;
  avg_cost: bigint;
  value: bigint;
};

/** Every part that has stock, by rack, with its value at average cost (stock below zero is worth nothing). A part made
 * inactive still counts while it has stock: the goods are on the shelf. */
export async function stockOnHand(db: Reader): Promise<StockOnHandRow[]> {
  const result = await db.execute<{
    id: string;
    name: string;
    number: string | null;
    rack_location: string | null;
    unit: string;
    quantity: string;
    avg_cost: string;
    value: string;
  }>(sql`
    select p.id, coalesce(p.name_bn, p.name_en) as name, p.rack_location, p.unit, l.quantity, p.avg_cost,
           case when l.quantity > 0 then round(l.quantity * p.avg_cost) else 0 end as value,
           (select n.number from part_numbers n where n.part_id = p.id and n.deleted_at is null
            order by n.is_main desc, n.created_at limit 1) as number
    from parts p join stock_levels l on l.part_id = p.id
    where p.deleted_at is null and l.quantity <> 0
    order by p.rack_location nulls last, p.name_en`);
  return result.rows.map((row) => ({ ...row, avg_cost: BigInt(row.avg_cost), value: BigInt(row.value) }));
}
