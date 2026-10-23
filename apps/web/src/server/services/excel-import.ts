import { dhakaDate, formatQuantity, parseQuantity, uuidv7 } from "@geargrid/core";
import {
  type Db,
  brands,
  categories,
  customerLedger,
  customers,
  fitments,
  importJobs,
  partNumbers,
  parts,
  stockLevels,
  stockMovements,
  supplierLedger,
  suppliers,
  vehicles,
} from "@geargrid/db";
import ExcelJS from "exceljs";
import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "../db";
import { apiError } from "../http/errors";
import { audit, changed, type AuditActor } from "../posting";
import { webError } from "./catalog-edit";
import { normalizePartNumber } from "./catalog-reads";

// The Excel import wizard (GearGrid plan 2.12 and appendix "Excel import templates"; DokaanBondhu spec D193, C5):
// parts with stock, prices, part numbers and fitment; customers with opening dues; suppliers with opening payables.
// An upload is read and checked into a preview (an import_jobs row holding the cells); the owner confirms it, and the
// rows are checked again and written in one transaction, in batches. While any row has an error nothing can be
// imported, so what is imported always equals the file (the plan's data migration check: stock value and opening dues
// as in the owner's Excel). Blank cells follow the appendix: a blank price is never 0; a blank retail price is an
// error, a blank garage or cost price a warning.

type Reader = Db | Tx;

export const IMPORT_KINDS = ["parts", "customers", "suppliers"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const MAX_ROWS = 5000;
/** 4 MB, so the upload with its form fits Vercel's 4.5 MB request (DokaanBondhu spec D209). */
export const MAX_BYTES = 4 * 1024 * 1024;

/** The template's columns in order, with the appendix's example row. */
export const TEMPLATES: Record<ImportKind, [string, string | number][]> = {
  parts: [
    ["name_en", "Brake Pad Front"],
    ["name_bn", "সামনের ব্রেক প্যাড"],
    ["vehicle_type", "car"],
    ["category", "Brakes"],
    ["brand", "Toyota"],
    ["quality", "genuine"],
    ["position", "front"],
    ["unit", "set"],
    ["part_number", "04465-33450"],
    ["other_numbers", "DNFR-0241; AN-101"],
    ["rack_location", "B-3"],
    ["retail_price", 4500],
    ["garage_price", 4200],
    ["cost_price", 3600],
    ["opening_qty", 3],
    ["reorder_level", 2],
    ["fits", "Toyota Axio 2012-2017 1NZ; Toyota Fielder 2012-2017"],
  ],
  customers: [
    ["name", "Rahim Motors"],
    ["type", "garage"],
    ["phone", "01711-123456"],
    ["address", "Bangshal, Dhaka"],
    ["credit_limit", 30000],
    ["opening_due", 12500],
    ["due_as_of_date", "2026-10-01"],
  ],
  suppliers: [
    ["name", "Bangshal Motor Supply"],
    ["phone", "01811-654321"],
    ["address", "Bangshal, Dhaka"],
    ["opening_payable", 45000],
    ["payable_as_of_date", "2026-10-01"],
  ],
};

const REQUIRED_COLUMN: Record<ImportKind, string> = {
  parts: "name_en",
  customers: "name",
  suppliers: "name",
};

export type RawCell = string | number | null;
export type RawRow = { line: number; cells: Record<string, RawCell> };
export type Issue = { level: "error" | "warning"; code: string; field?: string; value?: string };

export type PartValue = {
  nameEn: string;
  nameBn: string | null;
  vehicleType: "car" | "motorcycle" | "both";
  category: string;
  brand: string | null;
  quality: "genuine" | "aftermarket" | "reconditioned" | "used";
  position: "front" | "rear" | "left" | "right" | null;
  unit: "piece" | "set" | "pair" | "liter" | "box";
  number: string | null;
  otherNumbers: string[];
  rack: string | null;
  retail: number;
  garage: number | null;
  cost: number | null;
  openingQty: string;
  reorder: string;
  fits: {
    make: string;
    model: string;
    yearFrom: number;
    yearTo: number | null;
    engine: string | null;
    text: string;
  }[];
};

export type PartyValue = {
  name: string;
  type: "retail" | "garage";
  phone: string | null;
  address: string | null;
  creditLimit: number | null;
  opening: number;
  asOf: string;
};

export type CheckedRow = {
  line: number;
  name: string;
  issues: Issue[];
  value: PartValue | PartyValue | null;
};

export type Totals = {
  rows: number;
  errors: number;
  warnings: number;
  openingValue: number;
  opening: number;
};

// ---- Reading the file

/** A cell as text or a number; a date becomes yyyy-mm-dd; formulas give their result. */
function cellOf(value: ExcelJS.CellValue): RawCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (typeof value === "object") {
    if ("result" in value) return cellOf(value.result as ExcelJS.CellValue);
    if ("richText" in value) return cellOf(value.richText.map((part) => part.text).join(""));
    if ("text" in value) return cellOf(String(value.text));
    if ("error" in value) return null;
  }
  return null;
}

const header = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** The first sheet: row 1 names the columns, every later row with a value is a row to import. */
export async function readWorkbook(
  data: ArrayBuffer,
): Promise<
  | { ok: true; headers: string[]; rows: RawRow[] }
  | { ok: false; code: "UNREADABLE" | "EMPTY" | "TOO_MANY_ROWS" }
> {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(data);
  } catch {
    return { ok: false, code: "UNREADABLE" };
  }
  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount < 2) return { ok: false, code: "EMPTY" };
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column] = header(String(cellOf(cell.value) ?? ""));
  });
  const rows: RawRow[] = [];
  let tooMany = false;
  sheet.eachRow({ includeEmpty: false }, (row, line) => {
    if (line === 1) return;
    const cells: Record<string, RawCell> = {};
    let any = false;
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      const name = headers[column];
      const value = cellOf(cell.value);
      if (name && value !== null) {
        cells[name] = value;
        any = true;
      }
    });
    if (!any) return;
    if (rows.length >= MAX_ROWS) tooMany = true;
    else rows.push({ line, cells });
  });
  if (tooMany) return { ok: false, code: "TOO_MANY_ROWS" };
  if (rows.length === 0) return { ok: false, code: "EMPTY" };
  return { ok: true, headers: headers.filter(Boolean), rows };
}

/** The template: an empty sheet with the column names, and a sheet with the appendix's example row. */
export async function templateWorkbook(kind: ImportKind): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const columns = TEMPLATES[kind];
  const data = book.addWorksheet(kind);
  data.addRow(columns.map(([name]) => name)).font = { bold: true };
  const example = book.addWorksheet("example");
  example.addRow(columns.map(([name]) => name)).font = { bold: true };
  example.addRow(columns.map(([, value]) => value));
  for (const sheet of [data, example]) {
    columns.forEach(([name, value], i) => {
      sheet.getColumn(i + 1).width = Math.max(14, name.length + 2, String(value).length + 2);
    });
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

// ---- Checking

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

function text(cell: RawCell | undefined, max = 200): string | null {
  if (cell === null || cell === undefined) return null;
  const value = String(cell).trim();
  return value === "" ? null : value.slice(0, max);
}

/** A number as typed (Bangla digits, commas and a taka sign are fine); NaN when it is not one, null when blank. */
function numberOf(cell: RawCell | undefined): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "number") return cell;
  const plain = cell
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))
    .replace(/[,\s]/g, "")
    .replace(/^(৳|tk\.?|taka)/i, "");
  return /^-?\d+(\.\d+)?$/.test(plain) ? Number(plain) : Number.NaN;
}

/** Whole taka, never below zero; a fraction is rounded to the taka with a warning (D110). */
function taka(row: RawRow, field: string, issues: Issue[]): number | null {
  const value = numberOf(row.cells[field]);
  if (value === null) return null;
  if (Number.isNaN(value) || value < 0 || value > 100_000_000) {
    issues.push({ level: "error", code: "BAD_NUMBER", field, value: String(row.cells[field]) });
    return null;
  }
  if (!Number.isInteger(value))
    issues.push({ level: "warning", code: "ROUNDED", field, value: String(value) });
  return Math.round(value);
}

/** A quantity of at most three decimals, never below zero, as numeric(12,3) text. */
function quantity(row: RawRow, field: string, issues: Issue[]): string {
  const value = numberOf(row.cells[field]);
  if (value === null) return "0.000";
  const milli = Math.round((value as number) * 1000);
  if (Number.isNaN(value) || value < 0 || value > 1_000_000 || Math.abs(value * 1000 - milli) > 1e-6) {
    issues.push({ level: "error", code: "BAD_NUMBER", field, value: String(row.cells[field]) });
    return "0.000";
  }
  return formatQuantity(BigInt(milli));
}

function choice<T extends string>(
  row: RawRow,
  field: string,
  values: readonly T[],
  issues: Issue[],
  fallback: T | null,
): T | null {
  const value = text(row.cells[field])?.toLowerCase();
  if (!value) return fallback;
  if ((values as readonly string[]).includes(value)) return value as T;
  issues.push({ level: "error", code: "BAD_VALUE", field, value });
  return fallback;
}

/** yyyy-mm-dd, dd/mm/yyyy or dd-mm-yyyy (or an Excel date); blank is today; never in the future. */
function asOfDate(row: RawRow, field: string, issues: Issue[], today: string): string {
  const raw = text(row.cells[field]);
  if (!raw) return today;
  let iso: string | null = null;
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  if (ymd) iso = `${ymd[1]}-${ymd[2]!.padStart(2, "0")}-${ymd[3]!.padStart(2, "0")}`;
  else if (dmy) iso = `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  const valid =
    iso !== null &&
    !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) &&
    new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso);
  if (!valid) {
    issues.push({ level: "error", code: "BAD_DATE", field, value: raw });
    return today;
  }
  if (iso! > today) {
    issues.push({ level: "error", code: "FUTURE_DATE", field, value: raw });
    return today;
  }
  return iso!;
}

const FIT = /^(\S+)\s+(.+?)\s+(\d{4})(?:\s*[-–]\s*(\d{4}))?(?:\s+(\S+))?$/;

type Lookups = {
  categories: Map<string, string>;
  brands: Map<string, string>;
  vehicles: {
    id: string;
    make: string;
    model: string;
    yearFrom: number;
    yearTo: number | null;
    engine: string | null;
  }[];
  numbers: Set<string>;
  phones: Set<string>;
  names: Set<string>;
};

const digitsOnly = (phone: string) => phone.replace(/\D/g, "");

async function lookups(db: Reader, kind: ImportKind): Promise<Lookups> {
  const empty: Lookups = {
    categories: new Map(),
    brands: new Map(),
    vehicles: [],
    numbers: new Set(),
    phones: new Set(),
    names: new Set(),
  };
  if (kind === "parts") {
    const cats = await db.execute<{ id: string; name_en: string; name_bn: string | null }>(
      sql`select id, name_en, name_bn from categories where deleted_at is null`,
    );
    for (const c of cats.rows) {
      empty.categories.set(c.name_en.toLowerCase(), c.id);
      if (c.name_bn) empty.categories.set(c.name_bn.toLowerCase(), c.id);
    }
    const bs = await db.execute<{ id: string; name: string }>(
      sql`select id, name from brands where deleted_at is null`,
    );
    for (const b of bs.rows) empty.brands.set(b.name.toLowerCase(), b.id);
    const vs = await db.execute<{
      id: string;
      make: string;
      model: string;
      year_from: number;
      year_to: number | null;
      engine_code: string | null;
    }>(sql`select id, make, model, year_from, year_to, engine_code from vehicles where deleted_at is null`);
    empty.vehicles = vs.rows.map((v) => ({
      id: v.id,
      make: v.make.toLowerCase(),
      model: v.model.toLowerCase(),
      yearFrom: v.year_from,
      yearTo: v.year_to,
      engine: v.engine_code?.toLowerCase() ?? null,
    }));
    const ns = await db.execute<{ n: string }>(
      sql`select number_normalized as n from part_numbers where deleted_at is null`,
    );
    for (const row of ns.rows) empty.numbers.add(row.n);
  } else {
    const table = sql.identifier(kind);
    const ps = await db.execute<{ name: string; phone: string | null }>(
      sql`select name, phone from ${table} where deleted_at is null`,
    );
    for (const p of ps.rows) {
      empty.names.add(p.name.trim().toLowerCase());
      if (p.phone) empty.phones.add(digitsOnly(p.phone));
    }
  }
  return empty;
}

/** The vehicle a fitment names, or null when the list has none like it (the import adds it). */
export function matchVehicle(fit: PartValue["fits"][number], list: Lookups["vehicles"]): string | null {
  const found = list.find(
    (v) =>
      v.make === fit.make.toLowerCase() &&
      v.model === fit.model.toLowerCase() &&
      v.yearFrom === fit.yearFrom &&
      (fit.yearTo === null || v.yearTo === fit.yearTo) &&
      (fit.engine === null || v.engine === fit.engine.toLowerCase()),
  );
  return found?.id ?? null;
}

function checkPart(row: RawRow, found: Lookups, seen: Set<string>, issues: Issue[]): PartValue | null {
  const nameEn = text(row.cells.name_en, 150);
  if (!nameEn) issues.push({ level: "error", code: "REQUIRED", field: "name_en" });
  const category = text(row.cells.category, 80);
  if (!category) issues.push({ level: "error", code: "REQUIRED", field: "category" });
  else if (!found.categories.has(category.toLowerCase())) {
    issues.push({ level: "warning", code: "NEW_CATEGORY", field: "category", value: category });
  }
  const brand = text(row.cells.brand, 60);
  if (brand && !found.brands.has(brand.toLowerCase())) {
    issues.push({ level: "warning", code: "NEW_BRAND", field: "brand", value: brand });
  }
  const vehicleType = choice(row, "vehicle_type", ["car", "motorcycle", "both"] as const, issues, "car")!;
  const qualityGiven = text(row.cells.quality);
  const quality = choice(
    row,
    "quality",
    ["genuine", "aftermarket", "reconditioned", "used"] as const,
    issues,
    "genuine",
  )!;
  if (!qualityGiven) issues.push({ level: "warning", code: "QUALITY_ASSUMED", field: "quality" });
  const position = choice(row, "position", ["front", "rear", "left", "right"] as const, issues, null);
  const unit = choice(row, "unit", ["piece", "set", "pair", "liter", "box"] as const, issues, "piece")!;

  const numbers: string[] = [];
  const number = text(row.cells.part_number, 40);
  const others = (text(row.cells.other_numbers, 400) ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.slice(0, 40));
  for (const value of [number, ...others]) {
    if (!value) continue;
    const normalized = normalizePartNumber(value);
    if (numbers.includes(normalized)) continue;
    numbers.push(normalized);
    if (found.numbers.has(normalized)) issues.push({ level: "error", code: "NUMBER_IN_CATALOG", value });
    else if (seen.has(normalized)) issues.push({ level: "error", code: "NUMBER_TWICE", value });
    seen.add(normalized);
  }

  const retail = taka(row, "retail_price", issues);
  if (row.cells.retail_price === undefined)
    issues.push({ level: "error", code: "REQUIRED", field: "retail_price" });
  const garage = taka(row, "garage_price", issues);
  if (row.cells.garage_price === undefined)
    issues.push({ level: "warning", code: "GARAGE_BLANK", field: "garage_price" });
  const cost = taka(row, "cost_price", issues);
  if (row.cells.cost_price === undefined)
    issues.push({ level: "warning", code: "COST_BLANK", field: "cost_price" });

  const fits: PartValue["fits"] = [];
  for (const piece of (text(row.cells.fits, 1000) ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    const match = FIT.exec(piece);
    const yearFrom = Number(match?.[3]);
    const yearTo = match?.[4] ? Number(match[4]) : null;
    if (!match || yearFrom < 1950 || (yearTo !== null && yearTo < yearFrom)) {
      issues.push({ level: "warning", code: "FIT_UNREAD", field: "fits", value: piece });
      continue;
    }
    const fit = {
      make: match[1]!,
      model: match[2]!,
      yearFrom,
      yearTo,
      engine: match[5] ?? null,
      text: piece,
    };
    if (!matchVehicle(fit, found.vehicles))
      issues.push({ level: "warning", code: "NEW_VEHICLE", field: "fits", value: piece });
    fits.push(fit);
  }

  if (!nameEn || !category || retail === null) return null;
  return {
    nameEn,
    nameBn: text(row.cells.name_bn, 150),
    vehicleType,
    category,
    brand,
    quality,
    position,
    unit,
    number,
    otherNumbers: others,
    rack: text(row.cells.rack_location, 20),
    retail,
    garage,
    cost,
    openingQty: quantity(row, "opening_qty", issues),
    reorder: quantity(row, "reorder_level", issues),
    fits,
  };
}

function checkParty(
  kind: "customers" | "suppliers",
  row: RawRow,
  found: Lookups,
  seen: Set<string>,
  issues: Issue[],
  today: string,
): PartyValue | null {
  const name = text(row.cells.name, 100);
  if (!name) issues.push({ level: "error", code: "REQUIRED", field: "name" });
  else if (found.names.has(name.toLowerCase()))
    issues.push({ level: "warning", code: "NAME_EXISTS", value: name });
  const type =
    kind === "customers" ? choice(row, "type", ["retail", "garage"] as const, issues, "retail")! : "retail";
  const phone = text(row.cells.phone, 30);
  if (phone) {
    if (!/^[0-9+\- ]{6,20}$/.test(phone))
      issues.push({ level: "error", code: "BAD_PHONE", field: "phone", value: phone });
    else if (found.phones.has(digitsOnly(phone)))
      issues.push({ level: "error", code: "PHONE_EXISTS", value: phone });
    else if (seen.has(digitsOnly(phone))) issues.push({ level: "error", code: "PHONE_TWICE", value: phone });
    seen.add(digitsOnly(phone));
  }
  const openingField = kind === "customers" ? "opening_due" : "opening_payable";
  const opening = taka(row, openingField, issues) ?? 0;
  const creditLimit = kind === "customers" ? taka(row, "credit_limit", issues) : null;
  const asOf = asOfDate(row, kind === "customers" ? "due_as_of_date" : "payable_as_of_date", issues, today);
  if (!name) return null;
  return { name, type, phone, address: text(row.cells.address, 300), creditLimit, opening, asOf };
}

/** Every row checked against the file and the shop's data. */
export async function checkRows(
  db: Reader,
  kind: ImportKind,
  rows: RawRow[],
  now = new Date(),
): Promise<CheckedRow[]> {
  const found = await lookups(db, kind);
  const seen = new Set<string>();
  const today = dhakaDate(now);
  return rows.map((row) => {
    const issues: Issue[] = [];
    const value =
      kind === "parts"
        ? checkPart(row, found, seen, issues)
        : checkParty(kind, row, found, seen, issues, today);
    const name = text(row.cells[REQUIRED_COLUMN[kind]]) ?? "";
    return { line: row.line, name, issues, value: issues.some((i) => i.level === "error") ? null : value };
  });
}

export function totalsOf(kind: ImportKind, checked: CheckedRow[]): Totals {
  let openingValue = 0;
  let opening = 0;
  for (const row of checked) {
    if (!row.value) continue;
    if (kind === "parts") {
      const part = row.value as PartValue;
      openingValue += Math.round(Number(part.openingQty) * (part.cost ?? 0));
    } else opening += (row.value as PartyValue).opening;
  }
  return {
    rows: checked.length,
    errors: checked.filter((row) => row.issues.some((i) => i.level === "error")).length,
    warnings: checked.filter((row) => row.issues.some((i) => i.level === "warning")).length,
    openingValue,
    opening,
  };
}

// ---- The preview, kept as an import_jobs row

export type JobReport = {
  fileName: string;
  raw: RawRow[];
  checked: Omit<CheckedRow, "value">[];
  totals: Totals;
  imported?: { rows: number; openingValue: number; opening: number };
};

export async function createPreview(
  tx: Tx,
  actor: AuditActor,
  kind: ImportKind,
  fileName: string,
  raw: RawRow[],
  now = new Date(),
): Promise<string> {
  const checked = await checkRows(tx, kind, raw, now);
  const totals = totalsOf(kind, checked);
  const id = uuidv7();
  const report: JobReport = {
    fileName: fileName.slice(0, 200),
    raw,
    checked: checked.map(({ value: _value, ...row }) => row),
    totals,
  };
  await tx.insert(importJobs).values({
    id,
    kind,
    filePath: null,
    status: "preview",
    rowsOk: totals.rows - totals.errors,
    rowsFailed: totals.errors,
    report,
    createdAt: now,
    updatedAt: now,
  });
  await changed(tx, "import_jobs", id);
  await audit(tx, actor, "import.preview", "import_job", id, null, {
    kind,
    file: report.fileName,
    ...totals,
  });
  return id;
}

export async function cancelImport(tx: Tx, actor: AuditActor, id: string, now = new Date()): Promise<void> {
  const [job] = await tx.select().from(importJobs).where(eq(importJobs.id, id)).for("update");
  if (!job) throw apiError("NOT_FOUND", { entity: "import_job", id });
  if (job.status !== "preview") throw webError("IMPORT_NOT_OPEN");
  await tx
    .update(importJobs)
    .set({ status: "cancelled", updatedAt: now, version: sql`${importJobs.version} + 1` })
    .where(eq(importJobs.id, id));
  await changed(tx, "import_jobs", id);
  await audit(tx, actor, "import.cancel", "import_job", id, null, null);
}

// ---- Writing

const CHUNK = 500;

async function inChunks<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK));
}

async function changedMany(tx: Tx, entity: string, ids: string[]): Promise<void> {
  await inChunks(ids, (chunk) => changed(tx, entity, ...chunk));
}

/** Noon of a Dhaka day, the time an opening balance dated that day is written at. */
const noon = (day: string) => new Date(`${day}T12:00:00+06:00`);

async function writeParts(tx: Tx, jobId: string, values: PartValue[], now: Date) {
  const found = await lookups(tx, "parts");
  const stamp = { createdAt: now, updatedAt: now };
  // categories, brands and vehicles the shop does not have yet
  const newCategories = new Map<string, string>();
  const newBrands = new Map<string, string>();
  for (const part of values) {
    const c = part.category.toLowerCase();
    if (!found.categories.has(c) && !newCategories.has(c)) newCategories.set(c, part.category);
    const b = part.brand?.toLowerCase();
    if (b && !found.brands.has(b) && !newBrands.has(b)) newBrands.set(b, part.brand!);
  }
  for (const [key, name] of newCategories) {
    const id = uuidv7();
    await tx.insert(categories).values({ id, nameEn: name, ...stamp });
    found.categories.set(key, id);
    await changed(tx, "categories", id);
  }
  for (const [key, name] of newBrands) {
    const id = uuidv7();
    await tx.insert(brands).values({ id, name, ...stamp });
    found.brands.set(key, id);
    await changed(tx, "brands", id);
  }
  for (const part of values) {
    for (const fit of part.fits) {
      if (matchVehicle(fit, found.vehicles)) continue;
      const id = uuidv7();
      await tx.insert(vehicles).values({
        id,
        vehicleType: part.vehicleType === "motorcycle" ? "motorcycle" : "car",
        make: fit.make,
        model: fit.model,
        yearFrom: fit.yearFrom,
        yearTo: fit.yearTo,
        engineCode: fit.engine,
        source: "shop",
        ...stamp,
      });
      found.vehicles.push({
        id,
        make: fit.make.toLowerCase(),
        model: fit.model.toLowerCase(),
        yearFrom: fit.yearFrom,
        yearTo: fit.yearTo,
        engine: fit.engine?.toLowerCase() ?? null,
      });
      await changed(tx, "vehicles", id);
    }
  }

  const partRows: (typeof parts.$inferInsert)[] = [];
  const levelRows: (typeof stockLevels.$inferInsert)[] = [];
  const movementRows: (typeof stockMovements.$inferInsert)[] = [];
  const numberRows: (typeof partNumbers.$inferInsert)[] = [];
  const fitmentRows: (typeof fitments.$inferInsert)[] = [];
  for (const part of values) {
    const id = uuidv7();
    partRows.push({
      id,
      nameEn: part.nameEn,
      nameBn: part.nameBn,
      categoryId: found.categories.get(part.category.toLowerCase())!,
      brandId: part.brand ? found.brands.get(part.brand.toLowerCase())! : null,
      vehicleType: part.vehicleType,
      quality: part.quality,
      position: part.position,
      unit: part.unit,
      rackLocation: part.rack,
      retailPrice: BigInt(part.retail),
      garagePrice: part.garage === null ? null : BigInt(part.garage),
      avgCost: BigInt(part.cost ?? 0),
      reorderLevel: part.reorder,
      ...stamp,
    });
    levelRows.push({ partId: id, quantity: part.openingQty, updatedAt: now });
    if (parseQuantity(part.openingQty) > 0n) {
      movementRows.push({
        id: uuidv7(),
        partId: id,
        qtyChange: part.openingQty,
        reason: "opening",
        refType: "import",
        refId: jobId,
        unitCost: BigInt(part.cost ?? 0),
        ...stamp,
      });
    }
    const written = new Set<string>();
    const numbers = [
      ...(part.number ? [{ number: part.number, kind: "oem", isMain: true }] : []),
      ...part.otherNumbers.map((number) => ({ number, kind: "aftermarket", isMain: false })),
    ];
    for (const n of numbers) {
      const normalized = normalizePartNumber(n.number);
      if (written.has(normalized)) continue;
      written.add(normalized);
      numberRows.push({
        id: uuidv7(),
        partId: id,
        number: n.number,
        numberNormalized: normalized,
        kind: n.kind,
        isMain: n.isMain,
        ...stamp,
      });
    }
    const fitted = new Set<string>();
    for (const fit of part.fits) {
      const vehicleId = matchVehicle(fit, found.vehicles)!;
      if (fitted.has(vehicleId)) continue;
      fitted.add(vehicleId);
      fitmentRows.push({ id: uuidv7(), partId: id, vehicleId, source: "excel", verified: false, ...stamp });
    }
  }
  await inChunks(partRows, (chunk) => tx.insert(parts).values(chunk));
  await inChunks(levelRows, (chunk) => tx.insert(stockLevels).values(chunk));
  await inChunks(movementRows, (chunk) => tx.insert(stockMovements).values(chunk));
  await inChunks(numberRows, (chunk) => tx.insert(partNumbers).values(chunk));
  await inChunks(fitmentRows, (chunk) => tx.insert(fitments).values(chunk));
  await changedMany(
    tx,
    "parts",
    partRows.map((r) => r.id!),
  );
  await changedMany(
    tx,
    "stock_levels",
    partRows.map((r) => r.id!),
  );
  await changedMany(
    tx,
    "stock_movements",
    movementRows.map((r) => r.id!),
  );
  await changedMany(
    tx,
    "part_numbers",
    numberRows.map((r) => r.id!),
  );
  await changedMany(
    tx,
    "fitments",
    fitmentRows.map((r) => r.id!),
  );
  return partRows.map((r) => r.id!);
}

async function writeParties(
  tx: Tx,
  kind: "customers" | "suppliers",
  jobId: string,
  values: PartyValue[],
  now: Date,
) {
  const stamp = { createdAt: now, updatedAt: now };
  const ids: string[] = [];
  const ledgerIds: string[] = [];
  const partyRows: Record<string, unknown>[] = [];
  const ledgerRows: Record<string, unknown>[] = [];
  for (const party of values) {
    const id = uuidv7();
    ids.push(id);
    const opening = BigInt(party.opening);
    partyRows.push(
      kind === "customers"
        ? {
            id,
            name: party.name,
            type: party.type,
            priceTier: party.type,
            phone: party.phone,
            address: party.address,
            creditLimit: party.creditLimit === null ? null : BigInt(party.creditLimit),
            openingDue: opening,
            dueBalance: opening,
            ...stamp,
          }
        : {
            id,
            name: party.name,
            phone: party.phone,
            address: party.address,
            openingPayable: opening,
            payableBalance: opening,
            ...stamp,
          },
    );
    if (opening > 0n) {
      const ledgerId = uuidv7();
      ledgerIds.push(ledgerId);
      ledgerRows.push({
        id: ledgerId,
        [kind === "customers" ? "customerId" : "supplierId"]: id,
        entryType: "opening",
        refType: "import",
        refId: jobId,
        debit: opening,
        credit: 0n,
        balanceAfter: opening,
        createdAt: noon(party.asOf),
        updatedAt: now,
      });
    }
  }
  if (kind === "customers") {
    await inChunks(partyRows, (chunk) =>
      tx.insert(customers).values(chunk as (typeof customers.$inferInsert)[]),
    );
    await inChunks(ledgerRows, (chunk) =>
      tx.insert(customerLedger).values(chunk as (typeof customerLedger.$inferInsert)[]),
    );
    await changedMany(tx, "customers", ids);
    await changedMany(tx, "customer_ledger", ledgerIds);
  } else {
    await inChunks(partyRows, (chunk) =>
      tx.insert(suppliers).values(chunk as (typeof suppliers.$inferInsert)[]),
    );
    await inChunks(ledgerRows, (chunk) =>
      tx.insert(supplierLedger).values(chunk as (typeof supplierLedger.$inferInsert)[]),
    );
    await changedMany(tx, "suppliers", ids);
    await changedMany(tx, "supplier_ledger", ledgerIds);
  }
  return ids;
}

/** The totals of what was written, read back from the database, for the data migration check. */
async function importedTotals(tx: Tx, kind: ImportKind, ids: string[]) {
  if (ids.length === 0) return { rows: 0, openingValue: 0, opening: 0 };
  if (kind === "parts") {
    const [row] = (
      await tx.execute<{ value: string }>(sql`
      select coalesce(sum(round(l.quantity * p.avg_cost)), 0) as value
      from parts p join stock_levels l on l.part_id = p.id
      where p.id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`)
    ).rows;
    return { rows: ids.length, openingValue: Number(row?.value ?? 0), opening: 0 };
  }
  const column = sql.raw(kind === "customers" ? "opening_due" : "opening_payable");
  const [row] = (
    await tx.execute<{ total: string }>(sql`
    select coalesce(sum(${column}), 0) as total from ${sql.identifier(kind)}
    where id in (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`)
  ).rows;
  return { rows: ids.length, openingValue: 0, opening: Number(row?.total ?? 0) };
}

/** Checks the preview's rows again and, when none has an error, writes them all. */
export async function confirmImport(tx: Tx, actor: AuditActor, id: string, now = new Date()) {
  const [job] = await tx.select().from(importJobs).where(eq(importJobs.id, id)).for("update");
  if (!job) throw apiError("NOT_FOUND", { entity: "import_job", id });
  if (job.status !== "preview") throw webError("IMPORT_NOT_OPEN");
  const kind = job.kind as ImportKind;
  const report = job.report as JobReport;
  const checked = await checkRows(tx, kind, report.raw, now);
  const totals = totalsOf(kind, checked);
  if (totals.errors > 0) throw webError("IMPORT_HAS_ERRORS", { errors: totals.errors });
  const values = checked.map((row) => row.value!);
  const ids =
    kind === "parts"
      ? await writeParts(tx, id, values as PartValue[], now)
      : await writeParties(tx, kind, id, values as PartyValue[], now);
  const imported = await importedTotals(tx, kind, ids);
  await tx
    .update(importJobs)
    .set({
      status: "done",
      rowsOk: ids.length,
      rowsFailed: 0,
      report: { ...report, checked: checked.map(({ value: _value, ...row }) => row), totals, imported },
      updatedAt: now,
      version: sql`${importJobs.version} + 1`,
    })
    .where(and(eq(importJobs.id, id), eq(importJobs.status, "preview")));
  await changed(tx, "import_jobs", id);
  await audit(tx, actor, "import.confirm", "import_job", id, null, {
    kind,
    file: report.fileName,
    totals,
    imported,
  });
  return { totals, imported };
}

export type ImportJob = {
  id: string;
  kind: ImportKind;
  status: string;
  created_at: Date;
  report: JobReport;
};

export async function importJob(db: Reader, id: string): Promise<ImportJob | null> {
  const [row] = (
    await db.execute<ImportJob>(sql`
    select id, kind, status, created_at, report from import_jobs where id = ${id} and deleted_at is null`)
  ).rows;
  return row ? { ...row, created_at: new Date(row.created_at) } : null;
}

export async function recentImports(db: Reader) {
  const result = await db.execute<{
    id: string;
    kind: ImportKind;
    status: string;
    created_at: Date;
    file: string | null;
    rows_ok: number | null;
    rows_failed: number | null;
  }>(sql`
    select id, kind, status, created_at, report->>'fileName' as file, rows_ok, rows_failed
    from import_jobs where deleted_at is null order by created_at desc limit 20`);
  return result.rows.map((row) => ({ ...row, created_at: new Date(row.created_at) }));
}
