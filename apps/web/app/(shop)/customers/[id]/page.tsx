import { notFound } from "next/navigation";
import { database } from "../../../../src/server/db";
import { customerDetail } from "../../../../src/server/services/party-reads";
import { pageContext } from "../../../../src/web/page-context";
import { ActionForm } from "../../action-form";
import { LedgerTable } from "../../ledger-table";
import { editCustomerAction, removeCustomerAction } from "../../party-actions";
import { Field, PageHead } from "../../ui";

// One customer (GearGrid plan 2.5, 8.1): what they owe, their details and price tier, and the ledger. A customer with
// nothing in the ledger can be removed (D173).

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await customerDetail(database(), id) : null;
  if (!detail) notFound();
  const { customer, ledger, hasHistory } = detail;
  const page = await pageContext();
  const { t, taka } = page;
  const f = (name: string) => t(`fields.${name}`);
  return (
    <div className="space-y-6">
      <PageHead
        title={
          <>
            {customer.name}
            <span className="ml-2 text-lg font-normal text-stone-500">
              {t(`value.customer_type.${customer.type}`)}
            </span>
          </>
        }
      />
      <section className="card flex flex-wrap gap-x-10 gap-y-2 text-lg">
        <div>
          {t("customers.due")}:{" "}
          <strong data-testid="customer-due">{taka(BigInt(customer.due_balance))}</strong>
        </div>
        <div>
          {t("customers.credit_limit")}:{" "}
          {customer.credit_limit === null ? t("customers.no_limit") : taka(BigInt(customer.credit_limit))}
        </div>
        <div>
          {f("priceTier")}: {t(`value.price_tier.${customer.price_tier}`)}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("customers.ledger")}</h2>
        <LedgerTable
          ledger={ledger}
          page={page}
          labels={{
            debit: t("customers.debit"),
            credit: t("customers.credit"),
            balance: t("customers.balance"),
            empty: t("customers.empty_ledger"),
          }}
        />
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("customers.edit")}</h2>
        <ActionForm action={editCustomerAction} className="grid max-w-3xl gap-4 md:grid-cols-2">
          <input type="hidden" name="id" value={customer.id} />
          <Field label={f("name")}>
            <input name="name" defaultValue={customer.name} required maxLength={100} className="field" />
          </Field>
          <Field label={f("phone")}>
            <input
              name="phone"
              defaultValue={customer.phone ?? ""}
              maxLength={20}
              inputMode="tel"
              className="field"
            />
          </Field>
          <Field label={f("priceTier")} hint={t("customers.tier_hint")}>
            <select name="priceTier" defaultValue={customer.price_tier} className="field">
              <option value="retail">{t("value.price_tier.retail")}</option>
              <option value="garage">{t("value.price_tier.garage")}</option>
            </select>
          </Field>
          <Field label={f("creditLimit")} hint={t("customers.limit_blank")}>
            <input
              name="creditLimit"
              defaultValue={customer.credit_limit ?? ""}
              inputMode="numeric"
              className="field"
            />
          </Field>
          <Field label={f("address")} className="md:col-span-2">
            <input name="address" defaultValue={customer.address ?? ""} maxLength={300} className="field" />
          </Field>
          <div>
            <button type="submit" className="button-primary">
              {t("common.save")}
            </button>
          </div>
        </ActionForm>
      </section>

      {!hasHistory && customer.due_balance === "0" && (
        <section className="card">
          <p className="mb-3 text-stone-600">{t("customers.remove_hint")}</p>
          <ActionForm action={removeCustomerAction}>
            <input type="hidden" name="id" value={customer.id} />
            <button
              type="submit"
              className="min-h-12 rounded-lg bg-red-700 px-5 text-lg font-semibold text-white"
            >
              {t("customers.remove")}
            </button>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
