import Link from "next/link";
import { database } from "../../../src/server/db";
import { listCustomers } from "../../../src/server/services/party-reads";
import { pageContext } from "../../../src/web/page-context";
import { ButtonLink, cell, Field, money, PageHead, Table } from "../ui";

// Customers with their dues (GearGrid plan 2.5, 8.1), the biggest due first.

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomersPage({ searchParams }: { searchParams: Search }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";
  const { t, taka } = await pageContext();
  const customers = await listCustomers(database(), q);
  const total = customers.reduce((sum, c) => sum + BigInt(c.due_balance), 0n);
  return (
    <div>
      <PageHead title={t("customers.title")}>
        <ButtonLink href="/customers/new">{t("customers.new")}</ButtonLink>
      </PageHead>
      <form className="card mb-4 flex flex-wrap items-end gap-3" role="search">
        <Field label={t("customers.search_label")} className="min-w-64 flex-1">
          <input name="q" defaultValue={q} className="field" />
        </Field>
        <button type="submit" className="button-primary">
          {t("form.search")}
        </button>
      </form>
      <section className="card">
        <p className="mb-2 text-lg">
          {t("customers.total_due")}: <strong data-testid="total-due">{taka(total)}</strong>
        </p>
        {customers.length === 0 ? (
          <p className="text-stone-600">{t("customers.none")}</p>
        ) : (
          <Table
            right={[3, 4]}
            head={[
              t("fields.name"),
              t("fields.type"),
              t("fields.phone"),
              t("customers.credit_limit"),
              t("customers.due"),
            ]}
          >
            {customers.map((c) => (
              <tr key={c.id}>
                <td className={cell}>
                  <Link href={`/customers/${c.id}`} className="font-medium text-brand-ink hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className={cell}>{t(`value.customer_type.${c.type}`)}</td>
                <td className={cell}>{c.phone ?? t("form.none")}</td>
                <td className={money}>
                  {c.credit_limit === null ? t("customers.no_limit") : taka(BigInt(c.credit_limit))}
                </td>
                <td className={`${money} font-semibold`}>{taka(BigInt(c.due_balance))}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
