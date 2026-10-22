import { addDays, dhakaDate } from "@geargrid/core";
import ExcelJS from "exceljs";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database } from "../src/server/db";
import { EXPORT_TABLES, writeAllData } from "../src/server/services/data-export";
import { todaySummary } from "../src/server/services/home";
import {
  customerAging,
  dhakaStart,
  profitAndLoss,
  profitByPeriod,
  salesBy,
  statement,
  stockOnHand,
} from "../src/server/services/reports";
import { stockValue } from "../src/server/services/stock";
import { reportWorkbook } from "../src/web/excel";
import { pageContext } from "../src/web/page-context";
import { REPORTS, reportParams } from "../src/web/reports";
import { createTestShop, first, inCi, type TestShop } from "./harness";

// The reports (DokaanBondhu spec D193, C5), each against its own source of truth: profit and loss against the rows it
// sums and against Home; sales by part against the sale lines; aging against each due; statements against the
// ledgers; stock on hand against the stock value; every report's Excel file; the owner's full export.

describe.skipIf(!inCi)("reports", () => {
  let shop: TestShop;
  const db = () => database();
  const today = dhakaDate(new Date());
  const from = addDays(today, -75); // the seed's whole history
  const range = { start: dhakaStart(from), end: dhakaStart(addDays(today, 1)) };

  beforeAll(async () => {
    shop = await createTestShop("reportsweb");
  }, 180_000);

  afterAll(async () => shop?.drop());

  it("sums profit and loss from the rows, and each day adds up to the total", async () => {
    const pl = await profitAndLoss(db(), range.start, range.end);
    const sold = await first<{ total: string; count: string }>(
      shop,
      `select coalesce(sum(total), 0) as total, count(*) from sales where status = 'completed' and deleted_at is null
       and sale_time >= $1 and sale_time < $2`,
      [range.start, range.end],
    );
    expect(pl.sales).toBe(BigInt(sold.total));
    expect(pl.salesCount).toBe(Number(sold.count));
    expect(pl.net).toBe(pl.sales - pl.cost - (pl.returns - pl.returnedCost) - pl.expenses);

    const days = await profitByPeriod(db(), from, today, "day");
    expect(days).toHaveLength(76);
    const sum = (key: "sales" | "cost" | "returns" | "expenses" | "net") =>
      days.reduce((s, d) => s + d[key], 0n);
    expect(sum("sales")).toBe(pl.sales);
    expect(sum("cost")).toBe(pl.cost);
    expect(sum("returns")).toBe(pl.returns - pl.returnedCost);
    expect(sum("net")).toBe(pl.net);
    const months = await profitByPeriod(db(), from, today, "month");
    expect(months.reduce((s, m) => s + m.net, 0n)).toBe(pl.net);
  });

  it("gives Home the same profit as profit and loss for today", async () => {
    const home = await todaySummary(db(), new Date());
    const pl = await profitAndLoss(db(), dhakaStart(today), dhakaStart(addDays(today, 1)));
    expect(home.profit).toBe(pl.net);
    expect(home.sales).toBe(pl.sales);
  });

  it("splits sales by part, category and brand to the same totals, and shares out the bill's discount", async () => {
    const byPart = await salesBy(db(), "part", from, today);
    const lines = await first<{ quantity: string; lines: string }>(
      shop,
      `select coalesce(sum(i.quantity), 0) as quantity, count(*) as lines from sale_items i join sales s on s.id = i.sale_id
       where s.status = 'completed' and s.deleted_at is null and s.sale_time >= $1 and s.sale_time < $2`,
      [range.start, range.end],
    );
    expect(byPart.reduce((s, r) => s + Number(r.quantity), 0)).toBeCloseTo(Number(lines.quantity), 3);
    const amount = byPart.reduce((s, r) => s + r.amount, 0n);
    const pl = await profitAndLoss(db(), range.start, range.end);
    // each line's share is rounded to the taka, so the sum may differ from the bills' totals by half a taka a line
    expect(Number(amount - pl.sales)).toBeLessThanOrEqual(Number(lines.lines) / 2);
    expect(Number(pl.sales - amount)).toBeLessThanOrEqual(Number(lines.lines) / 2);
    for (const row of byPart) expect(row.profit).toBe(row.amount - row.cost);
    for (const by of ["category", "brand"] as const) {
      const rows = await salesBy(db(), by, from, today);
      expect(rows.reduce((s, r) => s + r.amount, 0n)).toBe(amount);
    }
  });

  it("ages each customer's due into buckets that add up to the due", async () => {
    const rows = await customerAging(db());
    const owing = await first<{ count: string }>(
      shop,
      "select count(*) from customers where due_balance > 0",
    );
    expect(rows).toHaveLength(Number(owing.count));
    for (const row of rows) {
      expect(row.d30 + row.d60 + row.d90 + row.older).toBe(row.due);
      expect(row.oldest).not.toBeNull();
    }
  });

  it("ends every statement at the balance the ledger keeps", async () => {
    const customer = await first<{ id: string; due_balance: string }>(
      shop,
      `select c.id, c.due_balance from customers c
       where (select count(*) from customer_ledger l where l.customer_id = c.id) > 3 order by c.name limit 1`,
    );
    const whole = await statement(db(), "customer", customer.id, from, today);
    expect(whole.closing).toBe(BigInt(customer.due_balance));
    expect(whole.opening + whole.lines.reduce((s, l) => s + l.debit - l.credit, 0n)).toBe(whole.closing);
    const middle = addDays(today, -20);
    const late = await statement(db(), "customer", customer.id, middle, today);
    const early = await statement(db(), "customer", customer.id, from, addDays(middle, -1));
    expect(late.opening).toBe(early.closing);
    const supplier = await first<{ id: string; payable_balance: string }>(
      shop,
      "select id, payable_balance from suppliers where payable_balance > 0 order by name limit 1",
    );
    expect((await statement(db(), "supplier", supplier.id, from, today)).closing).toBe(
      BigInt(supplier.payable_balance),
    );
  });

  it("values the stock on hand as the stock value does", async () => {
    const rows = await stockOnHand(db());
    expect(rows.reduce((s, r) => s + r.value, 0n)).toBe((await stockValue(db())).value);
  });

  it("builds every report and writes it as an Excel file that opens again", async () => {
    const page = await pageContext();
    const ids = {
      customer: (await first<{ id: string }>(shop, "select id from customers where due_balance > 0 limit 1"))
        .id,
      supplier: (await first<{ id: string }>(shop, "select id from suppliers limit 1")).id,
      account: (await first<{ id: string }>(shop, "select id from accounts where kind = 'cash'")).id,
    };
    for (const def of REPORTS) {
      const party = def.filters.includes("customer")
        ? ids.customer
        : def.filters.includes("supplier")
          ? ids.supplier
          : def.filters.includes("account")
            ? ids.account
            : undefined;
      const params = reportParams(def, { from, to: today, ...(party ? { party } : {}) });
      const result = await def.build(page, params);
      expect(result.tables.length, def.id).toBeGreaterThan(0);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load((await reportWorkbook(page.settings.shopName, result)) as unknown as ArrayBuffer);
      const rows = result.tables.reduce((s, table) => s + table.rows.length + (table.total ? 1 : 0), 0);
      expect(book.worksheets[0]!.rowCount, def.id).toBeGreaterThanOrEqual(rows + 2);
    }
  }, 120_000);

  it("exports every table of the shop, one sheet each", async () => {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    const ended = new Promise((resolve) => stream.on("end", resolve));
    await writeAllData(stream);
    await ended;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([...EXPORT_TABLES]);
    const parts = await first<{ count: string }>(shop, "select count(*) from parts");
    expect(book.getWorksheet("parts")!.actualRowCount).toBe(Number(parts.count) + 1);
    const users = book.getWorksheet("users")!.getRow(1).values as string[];
    expect(users).not.toContain("auth_user_id");
  });
});
