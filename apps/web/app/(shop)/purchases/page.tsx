import { addDays, dhakaDate } from "@geargrid/core";
import Link from "next/link";
import { database } from "../../../src/server/db";
import { listPurchases } from "../../../src/server/services/trade-reads";
import { pageContext } from "../../../src/web/page-context";
import { ButtonLink, cell, Field, money, PageHead, Table } from "../ui";

// Purchases of a range of days (the last 30 by default): supplier, bill number, total, paid and what is owed.

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const dayStart = (date: string) => new Date(`${date}T00:00:00+06:00`);

export default async function PurchasesPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const today = dhakaDate(new Date());
  const from = isDate(one(params.from)) ? one(params.from) : addDays(today, -30);
  const to = isDate(one(params.to)) ? one(params.to) : today;
  const q = one(params.q).slice(0, 60);
  const { t, taka, date } = await pageContext();
  const purchases = await listPurchases(database(), dayStart(from), dayStart(addDays(to, 1)), q);
  const completed = purchases.filter((p) => p.status === "completed");
  return (
    <div>
      <PageHead title={t("purchase.list")}>
        <ButtonLink href="/purchases/new">{t("purchase.new")}</ButtonLink>
      </PageHead>
      <form className="card mb-4 grid gap-3 md:grid-cols-[10rem_10rem_1fr_auto] md:items-end" role="search">
        <Field label={t("sale.from")}>
          <input type="date" name="from" defaultValue={from} className="field" />
        </Field>
        <Field label={t("sale.to")}>
          <input type="date" name="to" defaultValue={to} className="field" />
        </Field>
        <Field label={t("purchase.search_label")}>
          <input name="q" defaultValue={q} className="field" />
        </Field>
        <button type="submit" className="button-primary">
          {t("form.search")}
        </button>
      </form>
      <section className="card">
        <p className="mb-2 text-lg">
          {t("purchase.count", { count: completed.length })} · {t("sale.total")}:{" "}
          <strong>{taka(completed.reduce((s, p) => s + BigInt(p.total), 0n))}</strong>
        </p>
        {purchases.length === 0 ? (
          <p className="text-stone-600">{t("purchase.none")}</p>
        ) : (
          <Table
            right={[3, 4, 5]}
            head={[
              t("sale.date"),
              t("purchase.supplier"),
              t("purchase.bill_no"),
              t("sale.total"),
              t("sale.paid"),
              t("suppliers.payable"),
            ]}
          >
            {purchases.map((p) => (
              <tr key={p.id} className={p.status === "reversed" ? "text-stone-400 line-through" : ""}>
                <td className={cell}>
                  <Link href={`/purchases/${p.id}`} className="font-medium text-brand-ink hover:underline">
                    {date(p.purchase_time)}
                  </Link>
                </td>
                <td className={cell}>{p.supplier}</td>
                <td className={cell}>{p.bill_no ?? t("form.none")}</td>
                <td className={money}>{taka(BigInt(p.total))}</td>
                <td className={money}>{taka(BigInt(p.paid))}</td>
                <td className={money}>{p.due === "0" ? "" : taka(BigInt(p.due))}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
