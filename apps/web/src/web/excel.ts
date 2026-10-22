import ExcelJS from "exceljs";
import type { Cell, Kind, ReportResult } from "./reports";

// Excel files of the web dashboard (GearGrid plan 2.11 "every report can be exported to Excel", 2.12 the owner's full
// export; ExcelJS as the plan pins). Money is a number (whole taka, Excel's own digit grouping) so Excel can add it
// up, a quantity a number, a date a real date shown dd/mm/yyyy.

export const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const FORMATS: Partial<Record<Kind, string>> = {
  taka: "#,##0",
  qty: "0.###",
  count: "0",
  date: "dd/mm/yyyy",
};

/** A yyyy-mm-dd day as the Excel date of that day. */
const excelDate = (day: string) => new Date(`${day}T00:00:00Z`);

function cellValue(value: Cell, kind: Kind): ExcelJS.CellValue {
  if (value === null || value === undefined) return null;
  if (kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return excelDate(value);
  return value;
}

/** One sheet: the shop and the report's name, what it covers, then each table with its header and total. */
export async function reportWorkbook(shopName: string, result: ReportResult): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "GearGrid";
  const sheet = book.addWorksheet("Report");
  const width = Math.max(1, ...result.tables.map((table) => table.columns.length));
  const widths = Array.from({ length: width }, () => 10);
  const title = sheet.addRow([`${shopName} · ${result.title}`]);
  title.font = { bold: true, size: 14 };
  sheet.addRow([result.subtitle]);
  for (const table of result.tables) {
    sheet.addRow([]);
    if (table.title) sheet.addRow([table.title]).font = { bold: true };
    const header = sheet.addRow(table.columns.map((column) => column.label));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F1E9" } };
    });
    const rows = [...table.rows, ...(table.total ? [table.total] : [])];
    rows.forEach((row, index) => {
      const added = sheet.addRow(
        table.columns.map((column) => cellValue(row[column.key] ?? null, column.kind)),
      );
      table.columns.forEach((column, i) => {
        const format = FORMATS[column.kind];
        if (format) added.getCell(i + 1).numFmt = format;
        const text = String(row[column.key] ?? "");
        widths[i] = Math.min(60, Math.max(widths[i] ?? 10, text.length + 2, column.label.length + 2));
      });
      if (row._strong || (table.total && index === rows.length - 1)) added.font = { bold: true };
    });
  }
  if (result.note) {
    sheet.addRow([]);
    sheet.addRow([result.note]).font = { italic: true };
  }
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
  return Buffer.from(await book.xlsx.writeBuffer());
}

/** A safe file name: letters, digits and dashes. */
export function fileName(...parts: string[]): string {
  return `${parts.map((part) => part.replace(/[^A-Za-z0-9-]+/g, "-")).join("_")}.xlsx`;
}

export function download(buffer: Buffer | ReadableStream, name: string): Response {
  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
