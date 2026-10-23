import type { PageContext } from "../../../src/web/page-context";
import type { Cell, Kind, ReportResult } from "../../../src/web/reports";

// A report's tables as the page shows them: money as taka, quantities and dates in the shop's digits, subtotal rows
// and the total row in bold.

function show(page: PageContext, value: Cell, kind: Kind): string {
  if (value === null || value === undefined || value === "") return "";
  if (kind === "taka" && typeof value === "number") return page.taka(BigInt(value));
  if (kind === "qty" && typeof value === "number") return page.qty(value);
  if (kind === "count" && typeof value === "number") return page.digits(value);
  if (kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return page.date(value);
  return String(value);
}

export function ReportTables({ page, result }: { page: PageContext; result: ReportResult }) {
  return (
    <>
      {result.tables.map((table, index) => (
        <section key={index} className="card print:p-0 print:shadow-none" data-testid="report-table">
          {table.title && <h2 className="mb-3 text-lg font-semibold">{table.title}</h2>}
          {table.rows.length === 0 && !table.total ? (
            <p className="text-stone-600">{page.t("reports.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-[1.5px] border-stone-200 text-sm text-stone-600">
                    {table.columns.map((column) => (
                      <th
                        key={column.key}
                        className={`px-3 py-2.5 font-medium whitespace-nowrap ${column.kind === "text" || column.kind === "date" ? "" : "text-right"}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...table.rows, ...(table.total ? [table.total] : [])].map((row, r) => {
                    const total = table.total !== undefined && r === table.rows.length;
                    return (
                      <tr
                        key={r}
                        className={`${row._strong || total ? "font-semibold" : ""} ${total ? "border-t-[1.5px] border-stone-900" : "border-t border-stone-200 hover:bg-stone-50"}`}
                      >
                        {table.columns.map((column) => {
                          const value = row[column.key] ?? null;
                          const negative = column.kind === "taka" && typeof value === "number" && value < 0;
                          return (
                            <td
                              key={column.key}
                              className={`px-3 py-2.5 ${column.kind === "text" || column.kind === "date" ? "" : "text-right tabular-nums"} ${negative ? "text-red-700" : ""}`}
                            >
                              {show(page, value, column.kind)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      {result.note && <p className="text-sm text-stone-600">{result.note}</p>}
    </>
  );
}
