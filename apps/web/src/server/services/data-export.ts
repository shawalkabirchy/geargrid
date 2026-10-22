import ExcelJS from "exceljs";
import type { Writable } from "node:stream";
import { sql } from "drizzle-orm";
import { database } from "../db";

// The owner's full data export (GearGrid plan 2.12, "the data belongs to the shop"): one sheet per table, every row
// as it is stored, deleted ones included (their deleted_at says so). Left out: what is no business data or is
// secret (API keys, idempotency keys, the change log, sync commands, devices, invoice counters, import jobs, and the
// users' login IDs). Written as a stream, one table at a time, so a large shop does not have to fit in memory.

export const EXPORT_TABLES = [
  "settings",
  "accounts",
  "account_transactions",
  "daily_closings",
  "expense_categories",
  "expenses",
  "cheques",
  "categories",
  "brands",
  "parts",
  "part_numbers",
  "part_aliases",
  "vehicles",
  "fitments",
  "stock_levels",
  "stock_movements",
  "stock_adjustments",
  "customers",
  "customer_ledger",
  "customer_payments",
  "sales",
  "sale_items",
  "sale_payments",
  "returns",
  "return_items",
  "suppliers",
  "supplier_ledger",
  "supplier_payments",
  "purchases",
  "purchase_items",
  "users",
  "audit_logs",
] as const;

// pg type IDs: whole numbers and numeric become numbers, a date stays a day, json is written as text
const NUMBER_TYPES = new Set([20, 21, 23, 700, 701, 1700]);
const DATE_TYPE = 1082;
const JSON_TYPES = new Set([114, 3802]);

function value(raw: unknown, type: number): ExcelJS.CellValue {
  if (raw === null || raw === undefined) return null;
  if (NUMBER_TYPES.has(type)) {
    const number = Number(raw);
    return Number.isSafeInteger(number) || !Number.isInteger(number) ? number : String(raw);
  }
  if (type === DATE_TYPE && raw instanceof Date) {
    // node-postgres reads a date as that day's midnight in the server's time zone
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
  }
  if (JSON_TYPES.has(type)) return JSON.stringify(raw);
  if (Array.isArray(raw)) return raw.join(", ");
  if (raw instanceof Date || typeof raw === "boolean" || typeof raw === "number") return raw;
  return String(raw);
}

/** Writes the workbook to `stream` and ends it. */
export async function writeAllData(stream: Writable): Promise<void> {
  const book = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: false });
  book.creator = "GearGrid";
  const db = database();
  for (const table of EXPORT_TABLES) {
    const query =
      table === "users"
        ? sql`select id, name, phone, email, role, status, created_at, updated_at, deleted_at from users order by created_at`
        : sql`select * from ${sql.identifier(table)}`;
    const result = await db.execute(query);
    const sheet = book.addWorksheet(table);
    const fields = result.fields;
    const header = sheet.addRow(fields.map((field) => field.name));
    header.font = { bold: true };
    header.commit();
    for (const row of result.rows as Record<string, unknown>[]) {
      sheet.addRow(fields.map((field) => value(row[field.name], field.dataTypeID))).commit();
    }
    sheet.commit();
  }
  await book.commit();
}
