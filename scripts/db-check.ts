import pg from "pg";
import { z } from "zod";
import { isMain, log, readEnv, runMain } from "./lib/cli";

// npm run db:check (spec 5.6): fails with the offending rows unless the stock, ledgers, sales, purchases and
// returns agree with each other, no due or payable is negative, and every public table has row-level security.

export interface CheckResult {
  check: string;
  rows: Record<string, unknown>[];
}

const CHECKS: { check: string; query: string }[] = [
  {
    check: "1. stock level = sum of stock movements",
    query: `select p.id as part_id, coalesce(l.quantity, 0) as stock_level, coalesce(m.total, 0) as movements
      from parts p
      left join stock_levels l on l.part_id = p.id
      left join (select part_id, sum(qty_change) as total from stock_movements group by part_id) m on m.part_id = p.id
      where coalesce(l.quantity, 0) <> coalesce(m.total, 0)`,
  },
  {
    check: "2a. customer due = its ledger, opening due = its opening entry",
    query: `select c.id, c.name, c.due_balance, coalesce(l.balance, 0) as ledger, c.opening_due, coalesce(l.opening, 0) as opening_entry
      from customers c
      left join (select customer_id, sum(debit - credit) as balance,
                        sum(debit) filter (where entry_type = 'opening') as opening
                 from customer_ledger group by customer_id) l on l.customer_id = c.id
      where c.due_balance <> coalesce(l.balance, 0) or c.opening_due <> coalesce(l.opening, 0)`,
  },
  {
    check: "2b. customer ledger running balance",
    query: `select id, customer_id, seq, balance_after, running from (
        select id, customer_id, seq, balance_after,
               sum(debit - credit) over (partition by customer_id order by seq) as running
        from customer_ledger) x
      where balance_after <> running`,
  },
  {
    check: "2c. supplier payable = its ledger, opening payable = its opening entry",
    query: `select s.id, s.name, s.payable_balance, coalesce(l.balance, 0) as ledger, s.opening_payable, coalesce(l.opening, 0) as opening_entry
      from suppliers s
      left join (select supplier_id, sum(debit - credit) as balance,
                        sum(debit) filter (where entry_type = 'opening') as opening
                 from supplier_ledger group by supplier_id) l on l.supplier_id = s.id
      where s.payable_balance <> coalesce(l.balance, 0) or s.opening_payable <> coalesce(l.opening, 0)`,
  },
  {
    check: "2d. supplier ledger running balance",
    query: `select id, supplier_id, seq, balance_after, running from (
        select id, supplier_id, seq, balance_after,
               sum(debit - credit) over (partition by supplier_id order by seq) as running
        from supplier_ledger) x
      where balance_after <> running`,
  },
  {
    check: "3. sale subtotal = its lines, paid = its payments, total and due formulas",
    query: `select s.id, s.invoice_no, s.subtotal, coalesce(i.total, 0) as lines, s.paid, coalesce(p.total, 0) as payments
      from sales s
      left join (select sale_id, sum(line_total) as total from sale_items group by sale_id) i on i.sale_id = s.id
      left join (select sale_id, sum(amount) as total from sale_payments group by sale_id) p on p.sale_id = s.id
      where s.subtotal <> coalesce(i.total, 0) or s.paid <> coalesce(p.total, 0)
         or s.total <> s.subtotal - s.discount + s.round_off or s.due <> s.total - s.paid`,
  },
  {
    check: "4. purchase total = its lines, paid = its supplier payments",
    query: `select pu.id, pu.bill_no, pu.total, coalesce(i.total, 0) as lines, pu.paid, coalesce(p.total, 0) as payments
      from purchases pu
      left join (select purchase_id, sum(line_total) as total from purchase_items group by purchase_id) i on i.purchase_id = pu.id
      left join (select purchase_id, sum(amount) as total from supplier_payments group by purchase_id) p on p.purchase_id = pu.id
      where pu.total <> coalesce(i.total, 0) or pu.paid <> coalesce(p.total, 0)`,
  },
  {
    check: "5. return refund_due + refund_cash = total",
    query: `select id, total, refund_due, refund_cash from returns where refund_due + refund_cash <> total`,
  },
  {
    check: "6a. no negative due or payable",
    query: `select 'customer' as party, id, due_balance as balance from customers where due_balance < 0
      union all select 'supplier', id, payable_balance from suppliers where payable_balance < 0`,
  },
  {
    check: "6b. every public table has row-level security",
    query: `select c.relname as table_name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
  },
];

export async function runChecks(client: pg.ClientBase): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const { check, query } of CHECKS) {
    const { rows } = await client.query<Record<string, unknown>>(query);
    results.push({ check, rows });
  }
  return results;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const env = readEnv({ MIGRATION_DATABASE_URL: z.string().min(1) });
    const client = new pg.Client({ connectionString: env.MIGRATION_DATABASE_URL });
    await client.connect();
    try {
      const failures = (await runChecks(client)).filter((result) => result.rows.length > 0);
      for (const failure of failures) {
        console.error(`FAILED ${failure.check}: ${failure.rows.length} row(s)`);
        for (const row of failure.rows.slice(0, 20)) console.error(`  ${JSON.stringify(row)}`);
      }
      if (failures.length > 0) process.exit(1);
      log(`db:check passed (${CHECKS.length} checks)`);
    } finally {
      await client.end();
    }
  });
}
