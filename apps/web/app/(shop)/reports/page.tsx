import { Boxes, ChartColumn, ChevronRight, Download, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { pageContext } from "../../../src/web/page-context";
import { REPORTS } from "../../../src/web/reports";
import { PageHead } from "../ui";

// The reports (GearGrid plan 2.11), by group; the owner's full data export (2.12) at the end. Each report is a row the
// width of its card, so it is easy to hit (D207).

const GROUPS: { key: "sales" | "parties" | "stock" | "money"; icon: LucideIcon }[] = [
  { key: "sales", icon: ChartColumn },
  { key: "parties", icon: Users },
  { key: "stock", icon: Boxes },
  { key: "money", icon: Wallet },
];

export default async function ReportsPage() {
  const { t } = await pageContext();
  return (
    <div className="space-y-6">
      <PageHead title={t("reports.title")} />
      <div className="grid gap-6 md:grid-cols-2">
        {GROUPS.map(({ key, icon: Icon }) => (
          <section key={key} className="card">
            <h2 className="mb-2 flex items-center gap-3 text-xl font-semibold">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              {t(`reports.group.${key}`)}
            </h2>
            <ul>
              {REPORTS.filter((report) => report.group === key).map((report) => (
                <li key={report.id} className="border-t border-stone-200 first:border-t-0">
                  <Link
                    href={`/reports/${report.id}`}
                    className="group flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 text-lg text-brand-ink hover:bg-stone-50"
                  >
                    {t(`reports.name.${report.id}`)}
                    <ChevronRight
                      className="size-5 text-stone-400 group-hover:text-brand-ink"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <section className="card flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <h2 className="mb-1 text-xl font-semibold">{t("reports.all_data")}</h2>
          <p className="text-stone-600">{t("reports.all_data_hint")}</p>
        </div>
        <a href="/export/all" download className="button-secondary">
          <Download className="size-5" aria-hidden="true" />
          {t("reports.all_data_button")}
        </a>
      </section>
    </div>
  );
}
