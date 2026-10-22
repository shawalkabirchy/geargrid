import { addDays, dhakaDate } from "@geargrid/core";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database, type Tx } from "../src/server/db";
import type { AuditActor } from "../src/server/posting";
import { searchParts, partDetail } from "../src/server/services/catalog-reads";
import {
  cancelImport,
  confirmImport,
  createPreview,
  importJob,
  readWorkbook,
  templateWorkbook,
  type RawRow,
} from "../src/server/services/excel-import";
import { statement } from "../src/server/services/reports";
import { createTestShop, failedChecks, first, inCi, type TestShop } from "./harness";

// The Excel import wizard (DokaanBondhu spec D193, C5; GearGrid plan appendix "Excel import templates"): reading a
// real .xlsx, the appendix's blank-cell rules, errors that stop the import, and a clean file whose imported stock
// value and opening dues equal the file's (the plan's data migration check), with db:check passing.

async function xlsx(rows: (string | number | Date | null)[][]): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("data");
  for (const row of rows) sheet.addRow(row);
  const buffer = await book.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

const PART_HEADERS = [
  "name_en",
  "name_bn",
  "vehicle_type",
  "category",
  "brand",
  "quality",
  "position",
  "unit",
  "part_number",
  "other_numbers",
  "rack_location",
  "retail_price",
  "garage_price",
  "cost_price",
  "opening_qty",
  "reorder_level",
  "fits",
];

describe.skipIf(!inCi)("Excel import", () => {
  let shop: TestShop;
  let actor: AuditActor;
  const db = () => database();
  const run = <T>(change: (tx: Tx) => Promise<T>) => db().transaction(change);
  const read = async (rows: (string | number | Date | null)[][]): Promise<RawRow[]> => {
    const result = await readWorkbook(await xlsx(rows));
    if (!result.ok) throw new Error(result.code);
    return result.rows;
  };

  beforeAll(async () => {
    shop = await createTestShop("importweb");
    const owner = await first<{ id: string }>(shop, "select id from users where role = 'owner'");
    actor = { source: "web", userId: owner.id, actingUser: "Shop Owner (demo)" };
  }, 180_000);

  afterAll(async () => shop?.drop());

  it("reads headers loosely, dates as days, formulas as results, and skips empty rows", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("x");
    sheet.addRow(["Name EN", "Retail-Price", "Due As Of Date"]);
    sheet.addRow(["Pad", 4500, new Date("2026-10-01T00:00:00Z")]);
    sheet.addRow([]);
    sheet.addRow(["Shoe", { formula: "1000+500", result: 1500 }, null]);
    const result = await readWorkbook((await book.xlsx.writeBuffer()) as ArrayBuffer);
    expect(result).toMatchObject({
      ok: true,
      headers: ["name_en", "retail_price", "due_as_of_date"],
      rows: [
        { line: 2, cells: { name_en: "Pad", retail_price: 4500, due_as_of_date: "2026-10-01" } },
        { line: 4, cells: { name_en: "Shoe", retail_price: 1500 } },
      ],
    });
    expect(await readWorkbook(new TextEncoder().encode("not excel").buffer)).toEqual({
      ok: false,
      code: "UNREADABLE",
    });
    const template = new ExcelJS.Workbook();
    await template.xlsx.load((await templateWorkbook("parts")) as unknown as ArrayBuffer);
    expect(template.worksheets[0]!.getRow(1).values).toEqual([undefined, ...PART_HEADERS]);
  });

  it("marks the appendix's errors and warnings, and will not import while any row has an error", async () => {
    const rows = await read([
      PART_HEADERS,
      [
        "No retail price",
        "",
        "car",
        "Brakes",
        "",
        "genuine",
        "",
        "set",
        "TST-0001",
        "",
        "",
        null,
        100,
        80,
        1,
        0,
        "",
      ],
      [
        "Number in the catalog",
        "",
        "car",
        "Brakes",
        "",
        "genuine",
        "",
        "set",
        "04465-10010",
        "",
        "",
        500,
        "",
        "",
        1,
        0,
        "",
      ],
      ["Twice A", "", "car", "Brakes", "", "genuine", "", "set", "TST-0002", "", "", 500, 400, 300, 1, 0, ""],
      ["Twice B", "", "car", "Brakes", "", "genuine", "", "set", "tst 0002", "", "", 500, 400, 300, 1, 0, ""],
      [
        "Warnings only",
        "",
        "car",
        "New Category",
        "NewBrand",
        "",
        "",
        "",
        "TST-0003",
        "",
        "",
        "1,200.40",
        "",
        "",
        2,
        1,
        "Toyota Axio 2012-2017 1NZ; Tata Nano 2010-2015; garbage",
      ],
      [
        "Bad values",
        "",
        "truck",
        "Brakes",
        "",
        "shiny",
        "",
        "set",
        "TST-0004",
        "",
        "",
        -5,
        100,
        80,
        "2.5555",
        0,
        "",
      ],
    ]);
    const id = await run((tx) => createPreview(tx, actor, "parts", "bad.xlsx", rows));
    const job = (await importJob(db(), id))!;
    const codes = (line: number) =>
      job.report.checked.find((row) => row.line === line)!.issues.map((i) => `${i.level}:${i.code}`);
    expect(codes(2)).toContain("error:REQUIRED");
    expect(codes(3)).toEqual(
      expect.arrayContaining(["error:NUMBER_IN_CATALOG", "warning:GARAGE_BLANK", "warning:COST_BLANK"]),
    );
    expect(codes(4)).toEqual([]);
    expect(codes(5)).toContain("error:NUMBER_TWICE");
    expect(codes(6)).toEqual(
      expect.arrayContaining([
        "warning:NEW_CATEGORY",
        "warning:NEW_BRAND",
        "warning:QUALITY_ASSUMED",
        "warning:ROUNDED",
        "warning:NEW_VEHICLE",
        "warning:FIT_UNREAD",
      ]),
    );
    expect(codes(6).some((code) => code.startsWith("error:"))).toBe(false);
    expect(codes(7)).toEqual(expect.arrayContaining(["error:BAD_VALUE", "error:BAD_NUMBER"]));
    expect(job.report.totals).toMatchObject({ rows: 6, errors: 4 });
    await expect(run((tx) => confirmImport(tx, actor, id))).rejects.toMatchObject({
      code: "IMPORT_HAS_ERRORS",
    });
    await run((tx) => cancelImport(tx, actor, id));
    expect((await importJob(db(), id))!.status).toBe("cancelled");
    await expect(run((tx) => confirmImport(tx, actor, id))).rejects.toMatchObject({
      code: "IMPORT_NOT_OPEN",
    });
  });

  it("imports a clean parts file whose stock value equals the file's, with numbers, fitment and new vehicles", async () => {
    const rows = await read([
      PART_HEADERS,
      [
        "Import pad",
        "ইমপোর্ট প্যাড",
        "car",
        "Brakes",
        "Toyota",
        "genuine",
        "front",
        "set",
        "IMP-0001",
        "IMP-ALT-1; IMP-ALT-2",
        "Z-9",
        4500,
        4200,
        3600,
        3,
        2,
        "Toyota Axio 2012-2017 1NZ; Tata Nano 2010-2015",
      ],
      [
        "Import plug",
        "",
        "car",
        "Ignition",
        "",
        "aftermarket",
        "",
        "piece",
        "IMP-0002",
        "",
        "Z-9",
        350,
        "",
        200,
        "12",
        "",
        "",
      ],
      [
        "Import filter no cost",
        "",
        "both",
        "Filters",
        "",
        "genuine",
        "",
        "",
        "",
        "",
        "",
        600,
        550,
        "",
        0,
        "",
        "",
      ],
    ]);
    const id = await run((tx) => createPreview(tx, actor, "parts", "parts.xlsx", rows));
    const preview = (await importJob(db(), id))!;
    expect(preview.report.totals).toMatchObject({ rows: 3, errors: 0, openingValue: 3 * 3600 + 12 * 200 });
    const result = await run((tx) => confirmImport(tx, actor, id));
    expect(result.imported).toEqual({ rows: 3, openingValue: 3 * 3600 + 12 * 200, opening: 0 });
    expect((await importJob(db(), id))!.status).toBe("done");

    const pad = (await searchParts(db(), "IMP-ALT-2"))[0]!;
    const detail = (await partDetail(db(), pad.id))!;
    expect(detail.part).toMatchObject({
      name_en: "Import pad",
      stock: "3.000",
      avg_cost: "3600",
      garage_price: "4200",
    });
    expect(detail.numbers.map((n) => [n.number, n.is_main])).toEqual([
      ["IMP-0001", true],
      ["IMP-ALT-1", false],
      ["IMP-ALT-2", false],
    ]);
    expect(detail.fitments.map((f) => f.vehicle).sort()).toEqual(["Tata Nano", "Toyota Axio"]);
    expect(detail.fitments.every((f) => f.source === "excel")).toBe(true);
    expect(detail.movements).toMatchObject([{ reason: "opening", qty_change: "3.000", unit_cost: "3600" }]);
    const nano = await first<{ source: string; count: string }>(
      shop,
      "select source, count(*) over () as count from vehicles where make = 'Tata' and model = 'Nano'",
    );
    expect(nano).toEqual({ source: "shop", count: "1" });
    expect(await failedChecks(shop)).toEqual([]);

    // the same file again: every number is in the catalog now
    const again = await run((tx) => createPreview(tx, actor, "parts", "parts.xlsx", rows));
    expect((await importJob(db(), again))!.report.totals.errors).toBe(2);
  });

  it("imports customers with opening dues dated as the file says, and refuses a phone twice", async () => {
    const asOf = addDays(dhakaDate(new Date()), -10);
    const rows = await read([
      ["name", "type", "phone", "address", "credit_limit", "opening_due", "due_as_of_date"],
      ["Import Garage", "garage", "01999-000001", "Bangshal", 50000, "12,500", asOf],
      ["Import Walk", "", "", "", "", "", ""],
    ]);
    const id = await run((tx) => createPreview(tx, actor, "customers", "customers.xlsx", rows));
    expect((await importJob(db(), id))!.report.totals).toMatchObject({ errors: 0, opening: 12500 });
    const result = await run((tx) => confirmImport(tx, actor, id));
    expect(result.imported).toEqual({ rows: 2, openingValue: 0, opening: 12500 });
    const garage = await first<{
      id: string;
      due_balance: string;
      opening_due: string;
      price_tier: string;
      credit_limit: string;
    }>(
      shop,
      "select id, due_balance, opening_due, price_tier, credit_limit from customers where name = 'Import Garage'",
    );
    expect(garage).toMatchObject({
      due_balance: "12500",
      opening_due: "12500",
      price_tier: "garage",
      credit_limit: "50000",
    });
    const lines = await statement(db(), "customer", garage.id, asOf, asOf);
    expect(lines.lines).toMatchObject([{ entry_type: "opening", debit: 12500n }]);
    expect(await failedChecks(shop)).toEqual([]);

    const twice = await read([
      ["name", "phone"],
      ["Someone", "01999 000001"],
      ["Else", "01888-000002"],
      ["Else again", "01888000002"],
      ["Future", "", ""],
    ]);
    const second = await run((tx) => createPreview(tx, actor, "customers", "again.xlsx", twice));
    const checked = (await importJob(db(), second))!.report.checked;
    expect(checked.map((row) => row.issues.map((i) => i.code))).toEqual([
      ["PHONE_EXISTS"],
      [],
      ["PHONE_TWICE"],
      [],
    ]);
    const future = await read([
      ["name", "opening_due", "due_as_of_date"],
      ["Tomorrow", 100, addDays(dhakaDate(new Date()), 2)],
    ]);
    const third = await run((tx) => createPreview(tx, actor, "customers", "future.xlsx", future));
    expect((await importJob(db(), third))!.report.checked[0]!.issues.map((i) => i.code)).toEqual([
      "FUTURE_DATE",
    ]);
  });

  it("imports suppliers with opening payables", async () => {
    const rows = await read([
      ["name", "phone", "address", "opening_payable", "payable_as_of_date"],
      ["Import Supply", "01777-000003", "Dholaikhal", 45000, "01/10/2026"],
    ]);
    const id = await run((tx) => createPreview(tx, actor, "suppliers", "suppliers.xlsx", rows));
    const result = await run((tx) => confirmImport(tx, actor, id));
    expect(result.imported).toEqual({ rows: 1, openingValue: 0, opening: 45000 });
    const supplier = await first<{ payable_balance: string }>(
      shop,
      "select payable_balance from suppliers where name = 'Import Supply'",
    );
    expect(supplier.payable_balance).toBe("45000");
    expect(await failedChecks(shop)).toEqual([]);
  });
});
