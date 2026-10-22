import Link from "next/link";
import { database } from "../../../src/server/db";
import { IMPORT_KINDS, recentImports } from "../../../src/server/services/excel-import";
import { pageContext } from "../../../src/web/page-context";
import { ActionForm } from "../action-form";
import { uploadImportAction } from "../import-actions";
import { cell, Field, PageHead, Table } from "../ui";

// The Excel import wizard (GearGrid plan 2.12): download a template, fill it in, upload it, look at the preview,
// confirm. Parts with stock, prices, numbers and fitment; customers with opening dues; suppliers with opening payables.

export default async function ImportPage() {
  const { t, date } = await pageContext();
  const recent = await recentImports(database());
  return (
    <div className="space-y-6">
      <PageHead title={t("import.title")} />
      <p className="max-w-3xl text-stone-600">{t("import.intro")}</p>
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("import.step1")}</h2>
        <div className="flex flex-wrap gap-3">
          {IMPORT_KINDS.map((kind) => (
            <a
              key={kind}
              href={`/export/template/${kind}`}
              download
              className="button-primary inline-flex items-center"
            >
              {t("import.template", { kind: t(`import.kind.${kind}`) })}
            </a>
          ))}
        </div>
        <p className="mt-3 text-sm text-stone-600">{t("import.template_hint")}</p>
      </section>
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("import.step2")}</h2>
        <ActionForm action={uploadImportAction} className="flex flex-wrap items-end gap-3">
          <Field label={t("import.what")}>
            <select name="kind" className="field">
              {IMPORT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`import.kind.${kind}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("import.file_label")}>
            <input
              type="file"
              name="file"
              required
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="field py-2"
            />
          </Field>
          <button type="submit" className="button-primary">
            {t("import.check")}
          </button>
        </ActionForm>
      </section>
      {recent.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{t("import.recent")}</h2>
          <Table head={[t("part.date"), t("import.what"), t("import.file_label"), t("import.status"), ""]}>
            {recent.map((job) => (
              <tr key={job.id}>
                <td className={cell}>{date(job.created_at)}</td>
                <td className={cell}>{t(`import.kind.${job.kind}`)}</td>
                <td className={cell}>{job.file ?? t("form.none")}</td>
                <td className={cell}>{t(`import.state.${job.status}`, { defaultValue: job.status })}</td>
                <td className={cell}>
                  <Link href={`/import/${job.id}`} className="text-brand-ink underline">
                    {t("import.open")}
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </div>
  );
}
