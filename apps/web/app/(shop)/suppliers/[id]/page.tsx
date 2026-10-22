import { notFound } from "next/navigation";
import { database } from "../../../../src/server/db";
import { allAccounts } from "../../../../src/server/services/money";
import { supplierDetail } from "../../../../src/server/services/party-reads";
import { pageContext } from "../../../../src/web/page-context";
import { ActionForm } from "../../action-form";
import { LedgerTable } from "../../ledger-table";
import { editSupplierAction, removeSupplierAction } from "../../party-actions";
import { METHOD_KEYS } from "../../form-labels";
import { paySupplierAction } from "../../money-actions";
import { Field, PageHead } from "../../ui";

// One supplier (GearGrid plan 2.7, 8.1): what the shop owes, the details and the ledger. A supplier with nothing in
// the ledger can be removed (D173).

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await supplierDetail(database(), id) : null;
  if (!detail) notFound();
  const accounts = await allAccounts(database());
  const { supplier, ledger, hasHistory } = detail;
  const page = await pageContext();
  const { t, taka } = page;
  const f = (name: string) => t(`fields.${name}`);
  return (
    <div className="space-y-6">
      <PageHead title={supplier.name} />
      <section className="card text-lg">
        {t("suppliers.payable")}:{" "}
        <strong data-testid="supplier-payable">{taka(BigInt(supplier.payable_balance))}</strong>
      </section>

      {supplier.payable_balance !== "0" && (
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{t("supplier_pay.title")}</h2>
          <ActionForm action={paySupplierAction} reset className="grid gap-3 md:grid-cols-4 md:items-end">
            <input type="hidden" name="supplierId" value={supplier.id} />
            <Field label={t("sale.amount")}>
              <input name="amount" required inputMode="numeric" className="field" />
            </Field>
            <Field label={t("sale.method")}>
              <select name="method" className="field">
                {METHOD_KEYS.map((method) => (
                  <option key={method} value={method}>
                    {t(`value.method.${method}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("sale.account")} hint={t("form.optional")}>
              <select name="accountId" className="field">
                <option value="">—</option>
                {accounts
                  .filter((account) => account.is_active)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {t(`account_kind.${account.kind}`)}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={t("sale.trx_id")} hint={t("form.optional")}>
              <input name="trxId" maxLength={64} className="field" />
            </Field>
            <details className="md:col-span-4">
              <summary className="cursor-pointer text-stone-600">{t("value.method.cheque")}</summary>
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <Field label={t("sale.cheque_bank")}>
                  <input name="chequeBank" className="field" />
                </Field>
                <Field label={t("sale.cheque_no")}>
                  <input name="chequeNo" className="field" />
                </Field>
                <Field label={t("sale.cheque_due")}>
                  <input name="chequeDue" type="date" className="field" />
                </Field>
              </div>
            </details>
            <div>
              <button type="submit" className="button-primary">
                {t("supplier_pay.title")}
              </button>
            </div>
          </ActionForm>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("suppliers.ledger")}</h2>
        <LedgerTable
          ledger={ledger}
          page={page}
          labels={{
            debit: t("suppliers.debit"),
            credit: t("suppliers.credit"),
            balance: t("suppliers.balance"),
            empty: t("customers.empty_ledger"),
          }}
        />
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("suppliers.edit")}</h2>
        <ActionForm action={editSupplierAction} className="grid max-w-3xl gap-4 md:grid-cols-2">
          <input type="hidden" name="id" value={supplier.id} />
          <Field label={f("name")}>
            <input name="name" defaultValue={supplier.name} required maxLength={100} className="field" />
          </Field>
          <Field label={f("phone")}>
            <input
              name="phone"
              defaultValue={supplier.phone ?? ""}
              maxLength={20}
              inputMode="tel"
              className="field"
            />
          </Field>
          <Field label={f("address")} className="md:col-span-2">
            <input name="address" defaultValue={supplier.address ?? ""} maxLength={300} className="field" />
          </Field>
          <div>
            <button type="submit" className="button-primary">
              {t("common.save")}
            </button>
          </div>
        </ActionForm>
      </section>

      {!hasHistory && supplier.payable_balance === "0" && (
        <section className="card">
          <p className="mb-3 text-stone-600">{t("customers.remove_hint")}</p>
          <ActionForm action={removeSupplierAction}>
            <input type="hidden" name="id" value={supplier.id} />
            <button
              type="submit"
              className="min-h-12 rounded-lg bg-red-700 px-5 text-lg font-semibold text-white"
            >
              {t("suppliers.remove")}
            </button>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
