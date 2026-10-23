import { addDays, dhakaDate } from "@geargrid/core";
import Link from "next/link";
import { database } from "../../../src/server/db";
import { LIST_LIMIT, listSales } from "../../../src/server/services/trade-reads";
import { pageContext } from "../../../src/web/page-context";
import { ButtonLink, cell, Field, money, PageHead, Table } from "../ui";

// The sales register (GearGrid plan 2.11): the sales of a range of days (today by default), with customer, total,
// paid and due; a voided sale stays in the list, marked.

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** The instant a Dhaka calendar day starts. */
const dayStart = (date: string) => new Date(`${date}T00:00:00+06:00`);

export default async function SalesPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const today = dhakaDate(new Date());
  const from = isDate(one(params.from)) ? one(params.from) : today;
  const to = isDate(one(params.to)) ? one(params.to) : from > today ? from : today;
  const q = one(params.q).slice(0, 60);
  const { t, taka, date, digits } = await pageContext();
  const sales = await listSales(database(), dayStart(from), dayStart(addDays(to, 1)), q);
  const completed = sales.filter((sale) => sale.status === "completed");
  const sum = (key: "total" | "paid" | "due") => completed.reduce((s, sale) => s + BigInt(sale[key]), 0n);

  return (
    <div>
      <PageHead title={t("sale.list")}>
        <ButtonLink href="/sales/new">{t("sale.new")}</ButtonLink>
      </PageHead>
      <form className="card mb-4 grid gap-3 md:grid-cols-[10rem_10rem_1fr_auto] md:items-end" role="search">
        <Field label={t("sale.from")}>
          <input type="date" name="from" defaultValue={from} className="field" />
        </Field>
        <Field label={t("sale.to")}>
          <input type="date" name="to" defaultValue={to} className="field" />
        </Field>
        <Field label={t("sale.search_label")}>
          <input name="q" defaultValue={q} className="field" />
        </Field>
        <button type="submit" className="button-primary">
          {t("form.search")}
        </button>
      </form>
      <section className="card">
        <p className="mb-2 flex flex-wrap gap-x-6 text-lg" data-testid="sales-summary">
          <span>{t("sale.count", { count: completed.length })}</span>
          <span>
            {t("sale.total")}: <strong>{taka(sum("total"))}</strong>
          </span>
          <span>
            {t("sale.paid")}: {taka(sum("paid"))}
          </span>
          <span>
            {t("sale.due")}: {taka(sum("due"))}
          </span>
        </p>
        {sales.length >= LIST_LIMIT && <p className="mb-2 text-sm text-stone-500">{t("customers.more")}</p>}
        {sales.length === 0 ? (
          <p className="text-stone-600">{t("sale.none")}</p>
        ) : (
          <Table
            right={[3, 4, 5]}
            head={[
              t("sale.invoice"),
              t("sale.date"),
              t("sale.customer"),
              t("sale.total"),
              t("sale.paid"),
              t("sale.due"),
            ]}
          >
            {sales.map((sale) => (
              <tr key={sale.id} className={sale.status === "void" ? "text-stone-400 line-through" : ""}>
                <td className={cell}>
                  <Link href={`/sales/${sale.id}`} className="font-medium text-brand-ink hover:underline">
                    {sale.invoice_no}
                  </Link>
                </td>
                <td className={cell}>
                  {date(sale.sale_time)}{" "}
                  <span className="text-sm text-stone-500">
                    {digits(
                      sale.sale_time.toLocaleTimeString("en-GB", {
                        timeZone: "Asia/Dhaka",
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    )}
                  </span>
                </td>
                <td className={cell}>{sale.customer ?? t("sale.walk_in")}</td>
                <td className={money}>{taka(BigInt(sale.total))}</td>
                <td className={money}>{taka(BigInt(sale.paid))}</td>
                <td className={money}>{sale.due === "0" ? "" : taka(BigInt(sale.due))}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
