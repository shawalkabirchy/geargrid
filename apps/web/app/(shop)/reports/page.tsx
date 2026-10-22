import Link from "next/link";
import { pageContext } from "../../../src/web/page-context";
import { REPORTS } from "../../../src/web/reports";
import { PageHead } from "../ui";

// The reports (GearGrid plan 2.11), by group; the owner's full data export (2.12) at the end.

const GROUPS = ["sales", "parties", "stock", "money"] as const;

export default async function ReportsPage() {
  const { t } = await pageContext();
  return (
    <div className="space-y-6">
      <PageHead title={t("reports.title")} />
      <div className="grid gap-6 md:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group} className="card">
            <h2 className="mb-3 text-lg font-semibold">{t(`reports.group.${group}`)}</h2>
            <ul className="space-y-2">
              {REPORTS.filter((report) => report.group === group).map((report) => (
                <li key={report.id}>
                  <Link href={`/reports/${report.id}`} className="text-lg text-brand-ink hover:underline">
                    {t(`reports.name.${report.id}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">{t("reports.all_data")}</h2>
        <p className="mb-3 text-stone-600">{t("reports.all_data_hint")}</p>
        <a href="/export/all" download className="button-primary inline-flex items-center">
          {t("reports.all_data_button")}
        </a>
      </section>
    </div>
  );
}
