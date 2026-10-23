import Link from "next/link";
import { database } from "../../../src/server/db";
import { listSuppliers } from "../../../src/server/services/party-reads";
import { pageContext } from "../../../src/web/page-context";
import { ButtonLink, cell, Field, money, PageHead, Table } from "../ui";

// Suppliers with what the shop owes each (GearGrid plan 2.7, 8.1), the biggest first.

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function SuppliersPage({ searchParams }: { searchParams: Search }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";
  const { t, taka } = await pageContext();
  const suppliers = await listSuppliers(database(), q);
  const total = suppliers.reduce((sum, s) => sum + BigInt(s.payable_balance), 0n);
  return (
    <div>
      <PageHead title={t("suppliers.title")}>
        <ButtonLink href="/suppliers/new">{t("suppliers.new")}</ButtonLink>
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
          {t("suppliers.total_payable")}: <strong data-testid="total-payable">{taka(total)}</strong>
        </p>
        {suppliers.length === 0 ? (
          <p className="text-stone-600">{t("suppliers.none")}</p>
        ) : (
          <Table right={[2]} head={[t("fields.name"), t("fields.phone"), t("suppliers.payable")]}>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td className={cell}>
                  <Link href={`/suppliers/${s.id}`} className="font-medium text-brand-ink hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td className={cell}>{s.phone ?? t("form.none")}</td>
                <td className={`${money} font-semibold`}>{taka(BigInt(s.payable_balance))}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
