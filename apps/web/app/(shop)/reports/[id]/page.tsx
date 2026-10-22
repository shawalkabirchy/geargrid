import { addDays, dhakaDate } from "@geargrid/core";
import { CHEQUE_STATUSES } from "@geargrid/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "../../../../src/server/db";
import { allAccounts } from "../../../../src/server/services/money";
import { listCustomers, listSuppliers } from "../../../../src/server/services/party-reads";
import { pageContext } from "../../../../src/web/page-context";
import { REPORTS, reportParams, reportQuery, type ReportParams } from "../../../../src/web/reports";
import { PrintButton } from "../../print-button";
import { Field, PageHead, small } from "../../ui";
import { ReportTables } from "../report-tables";

// One report (GearGrid plan 2.11): its filters (a range with quick choices, the customer, supplier or account), its
// tables, and the Excel download, the print / PDF and, for a statement, WhatsApp.

type Search = Promise<Record<string, string | string[] | undefined>>;

/** A Bangladeshi mobile number for wa.me (8801XXXXXXXXX), or "" for WhatsApp's own picker. */
const whatsappNumber = (phone: string | null) => {
  const digits = (phone ?? "").replace(/\D/g, "");
  return /^01\d{9}$/.test(digits) ? `88${digits}` : /^8801\d{9}$/.test(digits) ? digits : "";
};

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Search;
}) {
  const { id } = await params;
  const def = REPORTS.find((report) => report.id === id);
  if (!def) notFound();
  const page = await pageContext();
  const { t } = page;
  const query = reportParams(def, await searchParams);
  const result = await def.build(page, query);
  const db = database();
  const parties = def.filters.includes("customer")
    ? (await listCustomers(db)).map((c) => ({ id: c.id, name: c.name }))
    : def.filters.includes("supplier")
      ? (await listSuppliers(db)).map((s) => ({ id: s.id, name: s.name }))
      : def.filters.includes("account")
        ? (await allAccounts(db)).map((a) => ({ id: a.id, name: a.name }))
        : [];
  const today = dhakaDate(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const presets: [string, Partial<ReportParams>][] = [
    ["reports.today", { from: today, to: today }],
    ["reports.this_month", { from: monthStart, to: today }],
    ["reports.last_month", { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd }],
    ["reports.last_90_days", { from: addDays(today, -89), to: today }],
  ];
  const link = (change: Partial<ReportParams>) =>
    `/reports/${def.id}?${reportQuery({ ...query, ...change })}`;
  const partyFilter = def.filters.find((f) => f === "customer" || f === "supplier" || f === "account");

  return (
    <div className="space-y-6">
      <PageHead title={result.title}>
        <a
          href={`/export/report/${def.id}?${reportQuery(query)}`}
          className="button-primary inline-flex items-center print:hidden"
          download
        >
          {t("reports.excel")}
        </a>
        <span className="print:hidden">
          <PrintButton label={t("reports.pdf")} />
        </span>
        {result.share && (
          <a
            href={`https://wa.me/${whatsappNumber(result.share.phone)}?text=${encodeURIComponent(result.share.text)}`}
            target="_blank"
            rel="noreferrer"
            className="button-primary inline-flex items-center print:hidden"
          >
            {t("sale.whatsapp")}
          </a>
        )}
      </PageHead>
      <p className="hidden text-lg font-semibold print:block">{page.settings.shopName}</p>
      <p className="text-lg text-stone-700" data-testid="report-subtitle">
        {result.subtitle}
      </p>

      {def.filters.length > 0 && (
        <form className="card space-y-3 print:hidden" data-testid="report-filters">
          {def.filters.includes("range") && (
            <div className="flex flex-wrap gap-2">
              {presets.map(([label, change]) => (
                <Link key={label} href={link(change)} className={small}>
                  {t(label)}
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {partyFilter && (
              <Field label={t(`reports.filter.${partyFilter}`)}>
                <select name="party" defaultValue={query.party ?? ""} className="field">
                  <option value="" disabled>
                    {t(`reports.pick_${partyFilter}`)}
                  </option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {def.filters.includes("cheque_status") && (
              <Field label={t("cheques.status")}>
                <select name="status" defaultValue={query.status ?? ""} className="field">
                  <option value="">{t("cheques.all")}</option>
                  {CHEQUE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`value.cheque_status.${s}`)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {def.filters.includes("range") && (
              <>
                <Field label={t("sale.from")}>
                  <input type="date" name="from" defaultValue={query.from} className="field" />
                </Field>
                <Field label={t("sale.to")}>
                  <input type="date" name="to" defaultValue={query.to} className="field" />
                </Field>
              </>
            )}
            <button type="submit" className="button-primary">
              {t("form.search")}
            </button>
          </div>
        </form>
      )}

      <ReportTables page={page} result={result} />
    </div>
  );
}
