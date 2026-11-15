import { addDays, dhakaDate } from "@geargrid/core";
import Link from "next/link";
import { database } from "../../../src/server/db";
import { LIST_LIMIT, listSales } from "../../../src/server/services/trade-reads";
import { pageContext } from "../../../src/web/page-context";
import { Badge, ButtonLink, CardGroup, cell, Field, money, PageHead, RowCard, Table } from "../ui";

// The sales register (GearGrid plan 2.11): the sales of a range of days (today by default), with customer, total,
// paid and due; a voided sale stays in the list, marked. On a phone the sales are cards, a day at a time (D243).

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
  const time = (at: Date) =>
    digits(at.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }));

  // The phone's cards, each day under its own heading (the list is newest first).
  const days: { day: string; sales: typeof sales }[] = [];
  for (const sale of sales) {
    const day = dhakaDate(sale.sale_time);
    if (days.at(-1)?.day === day) days.at(-1)!.sales.push(sale);
    else days.push({ day, sales: [sale] });
  }
  const cards = days.flatMap(({ day, sales: ofDay }) => [
    <CardGroup
      key={day}
      title={date(day)}
      side={t("sale.count", { count: ofDay.filter((sale) => sale.status === "completed").length })}
    />,
    ...ofDay.map((sale) => {
      const voided = sale.status === "void";
      return (
        <RowCard
          key={sale.id}
          href={`/sales/${sale.id}`}
          title={
            <span className={voided ? "text-stone-400 line-through" : ""}>
              {sale.customer ?? t("sale.walk_in")}
            </span>
          }
          amount={
            <span className={voided ? "text-stone-400 line-through" : ""}>{taka(BigInt(sale.total))}</span>
          }
          sub={`${sale.invoice_no} · ${time(sale.sale_time)}`}
          side={
            voided ? (
              <Badge>{t("value.sale_status.void")}</Badge>
            ) : sale.due !== "0" ? (
              <Badge tone="owed">
                {t("sale.due")} {taka(BigInt(sale.due))}
              </Badge>
            ) : (
              <span className="whitespace-nowrap text-paid">
                {t("sale.paid")} {taka(BigInt(sale.paid))}
              </span>
            )
          }
        />
      );
    }),
  ]);

  return (
    <div>
      <PageHead title={t("sale.list")}>
        {/* On a phone New sale is on the bottom bar (D243). */}
        <ButtonLink href="/sales/new" className="max-lg:hidden">
          {t("sale.new")}
        </ButtonLink>
      </PageHead>
      <form
        className="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-[10rem_10rem_1fr_auto] md:items-end"
        role="search"
      >
        <Field label={t("sale.from")}>
          <input type="date" name="from" defaultValue={from} className="field" />
        </Field>
        <Field label={t("sale.to")}>
          <input type="date" name="to" defaultValue={to} className="field" />
        </Field>
        <Field label={t("sale.search_label")} className="max-md:col-span-2">
          <input enterKeyHint="search" name="q" defaultValue={q} className="field" />
        </Field>
        <button type="submit" className="button-primary max-md:col-span-2">
          {t("form.search")}
        </button>
      </form>
      <section className="card max-md:border-0 max-md:bg-transparent max-md:p-0">
        <p className="mb-2 flex flex-wrap gap-x-6 text-lg max-md:hidden" data-testid="sales-summary">
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
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white px-3.5 py-3 md:hidden">
          <p className="text-[15px] text-stone-600">{t("sale.count", { count: completed.length })}</p>
          <dl className="mt-1 grid grid-cols-3 gap-2">
            {[
              { key: "total", tone: "" },
              { key: "paid", tone: "text-paid" },
              { key: "due", tone: "text-red-700" },
            ].map(({ key, tone }) => (
              <div key={key} className="min-w-0">
                <dt className="text-sm text-stone-600">{t(`sale.${key}`)}</dt>
                <dd className={`figure text-[17px] leading-tight font-bold ${tone}`}>
                  {taka(sum(key as "total" | "paid" | "due"))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {sales.length >= LIST_LIMIT && <p className="mb-2 text-sm text-stone-500">{t("customers.more")}</p>}
        {sales.length === 0 ? (
          <p className="text-stone-600 max-md:rounded-2xl max-md:border max-md:border-stone-200 max-md:bg-white max-md:p-4">
            {t("sale.none")}
          </p>
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
            cards={cards}
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
                  <span className="text-sm text-stone-500">{time(sale.sale_time)}</span>
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
