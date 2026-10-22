import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "../../../../src/server/db";
import { importJob } from "../../../../src/server/services/excel-import";
import { pageContext } from "../../../../src/web/page-context";
import { ActionForm } from "../../action-form";
import { cancelImportAction, confirmImportAction } from "../../import-actions";
import { cell, PageHead, Table } from "../../ui";

// An import's preview and result (GearGrid plan 2.12): every row with what is wrong (errors) or worth knowing
// (warnings), the totals the file holds, and, once imported, the same totals read back from the shop's data.

const SHOWN = 300;

export default async function ImportJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = /^[0-9a-f-]{36}$/i.test(id) ? await importJob(database(), id) : null;
  if (!job) notFound();
  const { t, taka, digits, date } = await pageContext();
  const { report } = job;
  const totals = report.totals;
  const flagged = report.checked.filter((row) => row.issues.length > 0);
  const clean = report.checked.length - flagged.length;
  const isParts = job.kind === "parts";
  const fileTotal = isParts ? totals.openingValue : totals.opening;
  const importedTotal = report.imported
    ? isParts
      ? report.imported.openingValue
      : report.imported.opening
    : null;

  return (
    <div className="space-y-6">
      <PageHead title={`${t("import.title")}: ${t(`import.kind.${job.kind}`)}`} />
      <section className="card grid gap-2 md:grid-cols-2 text-lg" data-testid="import-summary">
        <div>
          {t("import.file_label")}: <strong>{report.fileName}</strong> · {date(job.created_at)}
        </div>
        <div>
          {t("import.status")}: <strong data-testid="import-status">{t(`import.state.${job.status}`)}</strong>
        </div>
        <div>{t("import.rows", { count: totals.rows })}</div>
        <div>
          <span className={totals.errors > 0 ? "font-semibold text-red-700" : ""}>
            {t("import.errors", { count: totals.errors })}
          </span>{" "}
          · <span className="text-amber-800">{t("import.warnings", { count: totals.warnings })}</span>
        </div>
        <div data-testid="file-total">
          {t(isParts ? "import.file_stock_value" : `import.file_opening_${job.kind}`)}:{" "}
          {taka(BigInt(fileTotal))}
        </div>
        {importedTotal !== null && (
          <div
            data-testid="imported-total"
            className={importedTotal === fileTotal ? "text-brand-ink" : "text-red-700"}
          >
            {t("import.imported_total")}: {taka(BigInt(importedTotal))}{" "}
            {importedTotal === fileTotal ? `✓ ${t("import.matches")}` : `✗ ${t("import.differs")}`}
          </div>
        )}
      </section>

      {job.status === "preview" && (
        <section className="card space-y-3">
          {totals.errors > 0 ? (
            <p className="text-red-700">{t("import.fix_errors")}</p>
          ) : (
            <p className="text-stone-700">{t("import.ready", { count: totals.rows })}</p>
          )}
          <div className="flex flex-wrap gap-3">
            {totals.errors === 0 && (
              <ActionForm action={confirmImportAction}>
                <input type="hidden" name="id" value={job.id} />
                <button type="submit" className="button-primary">
                  {t("import.confirm")}
                </button>
              </ActionForm>
            )}
            <ActionForm action={cancelImportAction}>
              <input type="hidden" name="id" value={job.id} />
              <button type="submit" className="min-h-12 rounded-lg border border-stone-300 px-5 text-lg">
                {t("form.cancel")}
              </button>
            </ActionForm>
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">
          {t("import.rows_with_notes", { count: flagged.length })}
        </h2>
        <p className="mb-3 text-stone-600">{t("import.clean_rows", { count: clean })}</p>
        {flagged.length > 0 && (
          <Table head={[t("import.line"), t("fields.name"), t("import.notes")]}>
            {flagged.slice(0, SHOWN).map((row) => (
              <tr key={row.line} data-testid="import-row" className="align-top">
                <td className={`${cell} tabular-nums`}>{digits(row.line)}</td>
                <td className={cell}>{row.name || t("form.none")}</td>
                <td className={cell}>
                  <ul className="space-y-1">
                    {row.issues.map((issue, i) => (
                      <li key={i} className={issue.level === "error" ? "text-red-700" : "text-amber-800"}>
                        {issue.level === "error" ? "✗ " : "! "}
                        {t(`import.issue.${issue.code}`, {
                          field: issue.field ?? "",
                          value: issue.value ?? "",
                        })}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </Table>
        )}
        {flagged.length > SHOWN && (
          <p className="mt-2 text-sm text-stone-500">
            {t("import.more_rows", { count: flagged.length - SHOWN })}
          </p>
        )}
      </section>
      <Link href="/import" className="text-brand-ink underline">
        {t("form.back")}
      </Link>
    </div>
  );
}
