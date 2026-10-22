import { addDays, dhakaDate, dhakaDay } from "@geargrid/core";
import type { Db } from "@geargrid/db";
import { sql } from "drizzle-orm";
import type { Tx } from "../db";

// The home screen's today summary (GearGrid plan 2.11, "Today summary"): sales, profit, cash in hand, account
// balances, dues collected, expenses and the cheques due in the next seven days. "Today" is the shop's day in Dhaka.
//
// Profit follows the plan's rule (2.10): sales minus their cost (the average cost saved on each sale line) minus
// returns minus expenses. A return made today takes its value off today's profit and gives back the cost of what went
// back on the shelf (restock "yes"); damaged goods give nothing back.

type Reader = Db | Tx;

export interface AccountBalance {
  id: string;
  name: string;
  kind: string;
  balance: bigint;
}

export interface ChequeDue {
  id: string;
  direction: "received" | "issued";
  party: string;
  bank: string;
  chequeNo: string;
  amount: bigint;
  dueDate: string;
}

export interface TodaySummary {
  date: string;
  salesCount: number;
  sales: bigint;
  profit: bigint;
  duesCollected: bigint;
  expenses: bigint;
  cashInHand: bigint;
  accounts: AccountBalance[];
  chequesDue: ChequeDue[];
}

async function one(db: Reader, query: ReturnType<typeof sql>): Promise<Record<string, string | null>> {
  const result = await db.execute<Record<string, string | null>>(query);
  return result.rows[0] ?? {};
}

const big = (value: string | null | undefined): bigint => BigInt(value ?? "0");

/** Each active account's balance: its opening balance plus money in minus money out. */
export async function accountBalances(db: Reader): Promise<AccountBalance[]> {
  const result = await db.execute<{ id: string; name: string; kind: string; balance: string }>(sql`
    select a.id, a.name, a.kind,
           a.opening_balance + coalesce(sum(case when t.direction = 'in' then t.amount else -t.amount end), 0)
             as balance
    from accounts a
    left join account_transactions t on t.account_id = a.id and t.deleted_at is null
    where a.deleted_at is null and a.is_active
    group by a.id
    order by case a.kind when 'cash' then 0 when 'bkash' then 1 when 'nagad' then 2 when 'rocket' then 3 else 4 end,
             a.name`);
  return result.rows.map((row) => ({ ...row, balance: BigInt(row.balance) }));
}

export async function todaySummary(db: Reader, now: Date): Promise<TodaySummary> {
  const { start, end } = dhakaDay(now);
  const date = dhakaDate(now);

  const sold = await one(
    db,
    sql`
    select count(*) as count, coalesce(sum(s.total), 0) as total,
           coalesce(sum((select sum(round(i.quantity * i.unit_cost_at_sale))
                         from sale_items i where i.sale_id = s.id and i.deleted_at is null)), 0) as cost
    from sales s
    where s.status = 'completed' and s.deleted_at is null and s.sale_time >= ${start} and s.sale_time < ${end}`,
  );
  const returned = await one(
    db,
    sql`
    select coalesce(sum(r.total), 0) as total,
           coalesce(sum((select sum(round(ri.quantity * si.unit_cost_at_sale))
                         from return_items ri join sale_items si on si.id = ri.sale_item_id
                         where ri.return_id = r.id and ri.restock = 'yes' and ri.deleted_at is null)), 0) as cost
    from returns r
    where r.deleted_at is null and r.return_time >= ${start} and r.return_time < ${end}`,
  );
  const collected = await one(
    db,
    sql`
    select coalesce(sum(amount), 0) as total from customer_payments
    where status = 'completed' and deleted_at is null and received_at >= ${start} and received_at < ${end}`,
  );
  const spent = await one(
    db,
    sql`
    select coalesce(sum(amount), 0) as total from expenses
    where deleted_at is null and spent_at >= ${start} and spent_at < ${end}`,
  );

  const accounts = await accountBalances(db);
  const cheques = await db.execute<{
    id: string;
    direction: "received" | "issued";
    party: string | null;
    bank: string;
    cheque_no: string;
    amount: string;
    due_date: string;
  }>(sql`
    select c.id, c.direction, coalesce(cu.name, su.name) as party, c.bank, c.cheque_no, c.amount,
           to_char(c.due_date, 'YYYY-MM-DD') as due_date
    from cheques c
    left join customers cu on c.party_type = 'customer' and cu.id = c.party_id
    left join suppliers su on c.party_type = 'supplier' and su.id = c.party_id
    where c.status = 'pending' and c.deleted_at is null and c.due_date <= ${addDays(date, 7)}::date
    order by c.due_date, c.amount desc`);

  const sales = big(sold.total);
  const expenses = big(spent.total);
  return {
    date,
    salesCount: Number(sold.count ?? 0),
    sales,
    profit: sales - big(sold.cost) - (big(returned.total) - big(returned.cost)) - expenses,
    duesCollected: big(collected.total),
    expenses,
    cashInHand: accounts.filter((a) => a.kind === "cash").reduce((sum, a) => sum + a.balance, 0n),
    accounts,
    chequesDue: cheques.rows.map((row) => ({
      id: row.id,
      direction: row.direction,
      party: row.party ?? "",
      bank: row.bank,
      chequeNo: row.cheque_no,
      amount: BigInt(row.amount),
      dueDate: row.due_date,
    })),
  };
}
