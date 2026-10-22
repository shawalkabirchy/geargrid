import { addDays, dhakaDate } from "@geargrid/core";
import { database } from "../server/db";
import { allAccounts, cashBook, listCheques, listExpenses } from "../server/services/money";
import { listCustomers, listSuppliers } from "../server/services/party-reads";
import {
  customerAging,
  dhakaStart,
  profitAndLoss,
  profitByPeriod,
  salesBy,
  statement,
  stockOnHand,
  type SalesBy,
} from "../server/services/reports";
import { deadStock, lowStock } from "../server/services/stock";
import { listSales } from "../server/services/trade-reads";
import type { PageContext } from "./page-context";

// The reports of the web dashboard (GearGrid plan 2.11; DokaanBondhu spec D193, C5), each one a list of plain tables
// that the report page shows and the Excel export writes, so both always hold the same numbers. Money cells are whole
// taka, quantities numbers, dates yyyy-mm-dd (Dhaka days).

export type Cell = string | number | null;
export type Kind = "text" | "taka" | "qty" | "date" | "count";
export type Column = { key: string; label: string; kind: Kind };
/** A row's cells by column key; `_strong: 1` shows the row in bold (a subtotal). Keys without a column are not shown. */
export type Row = Record<string, Cell>;
export type Table = { title?: string; columns: Column[]; rows: Row[]; total?: Row };

export type ReportResult = {
  title: string;
  /** What the numbers cover, such as the range or the party. */
  subtitle: string;
  tables: Table[];
  note?: string;
  /** The report as text for a WhatsApp message (statements). */
  share?: { text: string; phone: string | null };
};

export type Filter = "range" | "customer" | "supplier" | "account" | "cheque_status";
export type ReportParams = { from: string; to: string; party: string | null; status: string | null };

export type ReportDef = {
  id: string;
  group: "sales" | "money" | "parties" | "stock";
  filters: Filter[];
  /** The range shown when none is asked for. */
  range: "today" | "month" | "quarter";
  build: (page: PageContext, params: ReportParams) => Promise<ReportResult>;
};

const n = (value: bigint) => Number(value);
const col = (page: PageContext, key: string, kind: Kind): Column => ({
  key,
  label: page.t(`reports.col.${key}`),
  kind,
});
const dateOf = (at: Date) => dhakaDate(at);

function rangeText(page: PageContext, params: ReportParams): string {
  return params.from === params.to
    ? page.date(params.from)
    : `${page.date(params.from)} – ${page.date(params.to)}`;
}

async function profitLoss(page: PageContext, params: ReportParams): Promise<ReportResult> {
  const { t } = page;
  const db = database();
  const total = await profitAndLoss(db, dhakaStart(params.from), dhakaStart(addDays(params.to, 1)));
  const days = (Date.parse(params.to) - Date.parse(params.from)) / 86_400_000 + 1;
  const periods = await profitByPeriod(db, params.from, params.to, days > 62 ? "month" : "day");
  const line = (label: string, amount: bigint, strong = false): Row => ({
    line: label,
    amount: n(amount),
    _strong: strong ? 1 : null,
  });
  const name = (en: string, bn: string | null) => (page.language === "bn" && bn ? bn : en);
  return {
    title: t("reports.name.profit_loss"),
    subtitle: rangeText(page, params),
    note: t("reports.note.profit_loss"),
    tables: [
      {
        columns: [col(page, "line", "text"), col(page, "amount", "taka")],
        rows: [
          line(t("reports.pl.sales", { count: total.salesCount }), total.sales),
          line(t("reports.pl.cost"), -total.cost),
          line(t("reports.pl.gross"), total.gross, true),
          line(t("reports.pl.returns"), -(total.returns - total.returnedCost)),
          ...total.expensesByCategory.map((e) =>
            line(t("reports.pl.expense", { name: name(e.name_en, e.name_bn) }), -e.amount),
          ),
          line(t("reports.pl.net"), total.net, true),
        ],
      },
      {
        title: t(days > 62 ? "reports.pl.by_month" : "reports.pl.by_day"),
        columns: [
          col(page, days > 62 ? "month" : "date", days > 62 ? "text" : "date"),
          col(page, "sales", "taka"),
          col(page, "cost", "taka"),
          col(page, "returns", "taka"),
          col(page, "expenses", "taka"),
          col(page, "net", "taka"),
        ],
        rows: periods.map((p) => ({
          [days > 62 ? "month" : "date"]: p.period,
          sales: n(p.sales),
          cost: n(p.cost),
          returns: n(p.returns),
          expenses: n(p.expenses),
          net: n(p.net),
        })),
        total: {
          [days > 62 ? "month" : "date"]: t("reports.total"),
          sales: n(total.sales),
          cost: n(total.cost),
          returns: n(total.returns - total.returnedCost),
          expenses: n(total.expenses),
          net: n(total.net),
        },
      },
    ],
  };
}

async function salesRegister(page: PageContext, params: ReportParams): Promise<ReportResult> {
  const sales = await listSales(database(), dhakaStart(params.from), dhakaStart(addDays(params.to, 1)));
  const done = sales.filter((s) => s.status === "completed");
  const sum = (key: "total" | "paid" | "due") => done.reduce((s, sale) => s + Number(sale[key]), 0);
  return {
    title: page.t("reports.name.sales_register"),
    subtitle: rangeText(page, params),
    note: page.t("reports.note.sales_register"),
    tables: [
      {
        columns: [
          col(page, "invoice", "text"),
          col(page, "date", "date"),
          col(page, "customer", "text"),
          col(page, "total", "taka"),
          col(page, "paid", "taka"),
          col(page, "due", "taka"),
          col(page, "status", "text"),
        ],
        rows: sales.map((s) => ({
          invoice: s.invoice_no,
          date: dateOf(s.sale_time),
          customer: s.customer ?? page.t("sale.walk_in"),
          total: Number(s.total),
          paid: Number(s.paid),
          due: Number(s.due),
          status: page.t(`value.sale_status.${s.status}`),
        })),
        total: { invoice: page.t("reports.total"), total: sum("total"), paid: sum("paid"), due: sum("due") },
      },
    ],
  };
}

function salesByReport(by: SalesBy) {
  return async (page: PageContext, params: ReportParams): Promise<ReportResult> => {
    const rows = await salesBy(database(), by, params.from, params.to);
    const total = rows.reduce(
      (s, r) => ({ amount: s.amount + r.amount, cost: s.cost + r.cost, profit: s.profit + r.profit }),
      { amount: 0n, cost: 0n, profit: 0n },
    );
    return {
      title: page.t(`reports.name.sales_by_${by}`),
      subtitle: rangeText(page, params),
      note: page.t(by === "vehicle" ? "reports.note.sales_by_vehicle" : "reports.note.sales_by"),
      tables: [
        {
          columns: [
            col(page, by, "text"),
            ...(by === "part" ? [col(page, "quantity", "qty")] : []),
            col(page, "amount", "taka"),
            col(page, "cost", "taka"),
            col(page, "profit", "taka"),
          ],
          rows: rows.map((r) => ({
            [by]: r.name,
            quantity: Number(r.quantity),
            amount: n(r.amount),
            cost: n(r.cost),
            profit: n(r.profit),
          })),
          // by car model a part can count under several models, so a total would count it twice
          ...(by === "vehicle"
            ? {}
            : {
                total: {
                  [by]: page.t("reports.total"),
                  amount: n(total.amount),
                  cost: n(total.cost),
                  profit: n(total.profit),
                },
              }),
        },
      ],
    };
  };
}

async function customerDues(page: PageContext): Promise<ReportResult> {
  const rows = await customerAging(database());
  const sum = (key: "due" | "d30" | "d60" | "d90" | "older") => n(rows.reduce((s, r) => s + r[key], 0n));
  return {
    title: page.t("reports.name.customer_dues"),
    subtitle: page.date(new Date()),
    note: page.t("reports.note.customer_dues"),
    tables: [
      {
        columns: [
          col(page, "customer", "text"),
          col(page, "phone", "text"),
          col(page, "due", "taka"),
          col(page, "d30", "taka"),
          col(page, "d60", "taka"),
          col(page, "d90", "taka"),
          col(page, "older", "taka"),
          col(page, "oldest", "date"),
        ],
        rows: rows.map((r) => ({
          customer: r.name,
          phone: r.phone,
          due: n(r.due),
          d30: n(r.d30),
          d60: n(r.d60),
          d90: n(r.d90),
          older: n(r.older),
          oldest: r.oldest ? dateOf(r.oldest) : null,
        })),
        total: {
          customer: page.t("reports.total"),
          due: sum("due"),
          d30: sum("d30"),
          d60: sum("d60"),
          d90: sum("d90"),
          older: sum("older"),
        },
      },
    ],
  };
}

function statementReport(party: "customer" | "supplier") {
  return async (page: PageContext, params: ReportParams): Promise<ReportResult> => {
    const { t, taka, date } = page;
    const db = database();
    const list =
      party === "customer"
        ? (await listCustomers(db)).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))
        : (await listSuppliers(db)).map((s) => ({ id: s.id, name: s.name, phone: s.phone }));
    const who = list.find((p) => p.id === params.party);
    const title = t(`reports.name.${party}_statement`);
    if (!who) return { title, subtitle: t(`reports.pick_${party}`), tables: [] };
    const s = await statement(db, party, who.id, params.from, params.to);
    const balanceKey = party === "customer" ? "due" : "payable";
    const text = [
      page.settings.shopName,
      `${title}: ${who.name}`,
      rangeText(page, params),
      "",
      `${t("reports.col.opening")}: ${taka(s.opening)}`,
      ...s.lines.map(
        (l) =>
          `${date(l.created_at)} ${t(`value.ledger.${l.entry_type}`)}${l.reference ? ` ${l.reference}` : ""}: ${
            l.debit > 0n ? `+${taka(l.debit)}` : `−${taka(l.credit)}`
          }`,
      ),
      `${t("reports.col.closing")}: ${taka(s.closing)}`,
    ].join("\n");
    return {
      title,
      subtitle: `${who.name} · ${rangeText(page, params)}`,
      share: { text, phone: who.phone },
      tables: [
        {
          columns: [
            col(page, "date", "date"),
            col(page, "entry", "text"),
            col(page, "reference", "text"),
            col(page, party === "customer" ? "debit" : "debit_supplier", "taka"),
            col(page, party === "customer" ? "credit" : "credit_supplier", "taka"),
            col(page, balanceKey, "taka"),
          ],
          rows: [
            { date: params.from, entry: t("reports.col.opening"), [balanceKey]: n(s.opening) },
            ...s.lines.map((l) => ({
              date: dateOf(l.created_at),
              entry: t(`value.ledger.${l.entry_type}`),
              reference: l.reference,
              [party === "customer" ? "debit" : "debit_supplier"]: l.debit === 0n ? null : n(l.debit),
              [party === "customer" ? "credit" : "credit_supplier"]: l.credit === 0n ? null : n(l.credit),
              [balanceKey]: n(l.balance_after),
            })),
          ],
          total: { date: params.to, entry: t("reports.col.closing"), [balanceKey]: n(s.closing) },
        },
      ],
    };
  };
}

async function supplierPayables(page: PageContext): Promise<ReportResult> {
  const rows = await listSuppliers(database());
  return {
    title: page.t("reports.name.supplier_payables"),
    subtitle: page.date(new Date()),
    tables: [
      {
        columns: [col(page, "supplier", "text"), col(page, "phone", "text"), col(page, "payable", "taka")],
        rows: rows.map((s) => ({ supplier: s.name, phone: s.phone, payable: Number(s.payable_balance) })),
        total: {
          supplier: page.t("reports.total"),
          payable: rows.reduce((sum, s) => sum + Number(s.payable_balance), 0),
        },
      },
    ],
  };
}

async function stockReport(page: PageContext): Promise<ReportResult> {
  const rows = await stockOnHand(database());
  return {
    title: page.t("reports.name.stock_on_hand"),
    subtitle: page.date(new Date()),
    tables: [
      {
        columns: [
          col(page, "rack", "text"),
          col(page, "part", "text"),
          col(page, "number", "text"),
          col(page, "quantity", "qty"),
          col(page, "avg_cost", "taka"),
          col(page, "value", "taka"),
        ],
        rows: rows.map((r) => ({
          rack: r.rack_location,
          part: r.name,
          number: r.number,
          quantity: Number(r.quantity),
          avg_cost: n(r.avg_cost),
          value: n(r.value),
        })),
        total: { rack: page.t("reports.total"), value: n(rows.reduce((s, r) => s + r.value, 0n)) },
      },
    ],
  };
}

function stockList(which: "low" | "dead") {
  return async (page: PageContext): Promise<ReportResult> => {
    const db = database();
    const rows = which === "low" ? await lowStock(db) : await deadStock(db);
    return {
      title: page.t(`reports.name.${which}_stock`),
      subtitle: page.date(new Date()),
      tables: [
        {
          columns: [
            col(page, "part", "text"),
            col(page, "number", "text"),
            col(page, "rack", "text"),
            col(page, "quantity", "qty"),
            which === "low" ? col(page, "reorder", "qty") : col(page, "last_sale", "date"),
          ],
          rows: rows.map((r) => ({
            part: r.name_bn ?? r.name_en,
            number: r.number,
            rack: r.rack_location,
            quantity: Number(r.stock),
            reorder: Number(r.reorder_level),
            last_sale: r.last_sale ? dateOf(r.last_sale) : null,
          })),
        },
      ],
    };
  };
}

async function cashBookReport(page: PageContext, params: ReportParams): Promise<ReportResult> {
  const { t } = page;
  const accounts = await allAccounts(database());
  const account = accounts.find((a) => a.id === params.party);
  if (!account)
    return { title: t("reports.name.cash_book"), subtitle: t("reports.pick_account"), tables: [] };
  const book = await cashBook(database(), account.id, params.from, params.to);
  let balance = book.opening;
  const running = book.lines.map((line) => {
    balance += line.direction === "in" ? BigInt(line.amount) : -BigInt(line.amount);
    return { line, balance };
  });
  return {
    title: t("reports.name.cash_book"),
    subtitle: `${account.name} · ${rangeText(page, params)}`,
    tables: [
      {
        columns: [
          col(page, "date", "date"),
          col(page, "what", "text"),
          col(page, "reference", "text"),
          col(page, "in", "taka"),
          col(page, "out", "taka"),
          col(page, "balance", "taka"),
        ],
        rows: [
          { date: params.from, what: t("reports.col.opening"), balance: n(book.opening) },
          ...running.map(({ line: l, balance }) => ({
            date: dateOf(l.created_at),
            what: `${t(`value.ref.${l.ref_type}`, { defaultValue: l.ref_type })}${l.note ? ` · ${l.note}` : ""}`,
            reference: l.reference,
            in: l.direction === "in" ? Number(l.amount) : null,
            out: l.direction === "out" ? Number(l.amount) : null,
            balance: n(balance),
          })),
        ],
        total: {
          date: params.to,
          what: t("reports.col.closing"),
          in: n(book.moneyIn),
          out: n(book.moneyOut),
          balance: n(book.closing),
        },
      },
    ],
  };
}

async function expensesReport(page: PageContext, params: ReportParams): Promise<ReportResult> {
  const rows = await listExpenses(database(), params.from, params.to);
  const name = (en: string, bn: string | null) => (page.language === "bn" && bn ? bn : en);
  const byCategory = new Map<string, number>();
  for (const row of rows) {
    const key = name(row.category, row.category_bn);
    byCategory.set(key, (byCategory.get(key) ?? 0) + Number(row.amount));
  }
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  return {
    title: page.t("reports.name.expenses"),
    subtitle: rangeText(page, params),
    tables: [
      {
        title: page.t("reports.by_category"),
        columns: [col(page, "category", "text"), col(page, "amount", "taka")],
        rows: [...byCategory].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })),
        total: { category: page.t("reports.total"), amount: total },
      },
      {
        title: page.t("reports.each_expense"),
        columns: [
          col(page, "date", "date"),
          col(page, "category", "text"),
          col(page, "account", "text"),
          col(page, "note", "text"),
          col(page, "amount", "taka"),
        ],
        rows: rows.map((r) => ({
          date: dateOf(r.spent_at),
          category: name(r.category, r.category_bn),
          account: r.account,
          note: r.note,
          amount: Number(r.amount),
        })),
      },
    ],
  };
}

async function chequeReport(page: PageContext, params: ReportParams): Promise<ReportResult> {
  const rows = await listCheques(database(), params.status);
  return {
    title: page.t("reports.name.cheques"),
    subtitle: params.status ? page.t(`value.cheque_status.${params.status}`) : page.t("cheques.all"),
    tables: [
      {
        columns: [
          col(page, "date", "date"),
          col(page, "direction", "text"),
          col(page, "party", "text"),
          col(page, "bank", "text"),
          col(page, "cheque_no", "text"),
          col(page, "amount", "taka"),
          col(page, "status", "text"),
        ],
        rows: rows.map((c) => ({
          date: c.due_date,
          direction: page.t(`value.cheque_direction.${c.direction}`),
          party: c.party,
          bank: c.bank,
          cheque_no: c.cheque_no,
          amount: Number(c.amount),
          status: page.t(`value.cheque_status.${c.status}`),
        })),
      },
    ],
  };
}

export const REPORTS: ReportDef[] = [
  { id: "profit_loss", group: "sales", filters: ["range"], range: "month", build: profitLoss },
  { id: "sales_register", group: "sales", filters: ["range"], range: "today", build: salesRegister },
  { id: "sales_by_part", group: "sales", filters: ["range"], range: "month", build: salesByReport("part") },
  {
    id: "sales_by_category",
    group: "sales",
    filters: ["range"],
    range: "month",
    build: salesByReport("category"),
  },
  { id: "sales_by_brand", group: "sales", filters: ["range"], range: "month", build: salesByReport("brand") },
  {
    id: "sales_by_vehicle",
    group: "sales",
    filters: ["range"],
    range: "month",
    build: salesByReport("vehicle"),
  },
  { id: "customer_dues", group: "parties", filters: [], range: "today", build: customerDues },
  {
    id: "customer_statement",
    group: "parties",
    filters: ["customer", "range"],
    range: "quarter",
    build: statementReport("customer"),
  },
  { id: "supplier_payables", group: "parties", filters: [], range: "today", build: supplierPayables },
  {
    id: "supplier_statement",
    group: "parties",
    filters: ["supplier", "range"],
    range: "quarter",
    build: statementReport("supplier"),
  },
  { id: "stock_on_hand", group: "stock", filters: [], range: "today", build: stockReport },
  { id: "low_stock", group: "stock", filters: [], range: "today", build: stockList("low") },
  { id: "dead_stock", group: "stock", filters: [], range: "today", build: stockList("dead") },
  { id: "cash_book", group: "money", filters: ["account", "range"], range: "today", build: cashBookReport },
  { id: "expenses", group: "money", filters: ["range"], range: "month", build: expensesReport },
  { id: "cheques", group: "money", filters: ["cheque_status"], range: "today", build: chequeReport },
];

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/** The report's dates and party from the address; a missing or wrong date falls back to the report's own range. */
export function reportParams(
  def: ReportDef,
  query: Record<string, string | string[] | undefined>,
): ReportParams {
  const one = (key: string) => {
    const value = query[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const today = dhakaDate(new Date());
  const start =
    def.range === "today" ? today : def.range === "month" ? `${today.slice(0, 8)}01` : addDays(today, -89);
  let from = isDate(one("from")) ? one("from") : start;
  let to = isDate(one("to")) ? one("to") : today;
  if (from > to) [from, to] = [to, from];
  if (Date.parse(to) - Date.parse(from) > 3 * 366 * 86_400_000) from = addDays(to, -3 * 366); // at most three years
  const party = /^[0-9a-f-]{36}$/i.test(one("party")) ? one("party") : null;
  const status = one("status") || null;
  return { from, to, party, status };
}

/** The address of a report with its filters, for the presets, the Excel link and the statements' links. */
export function reportQuery(params: ReportParams): string {
  const query = new URLSearchParams({ from: params.from, to: params.to });
  if (params.party) query.set("party", params.party);
  if (params.status) query.set("status", params.status);
  return query.toString();
}
