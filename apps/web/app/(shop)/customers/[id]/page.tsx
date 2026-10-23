import { notFound } from "next/navigation";
import { database } from "../../../../src/server/db";
import { customerDetail } from "../../../../src/server/services/party-reads";
import { accountOptions, customerPaymentList } from "../../../../src/server/services/trade-reads";
import { pageContext } from "../../../../src/web/page-context";
import { ActionForm } from "../../action-form";
import { LedgerTable } from "../../ledger-table";
import { editCustomerAction, removeCustomerAction } from "../../party-actions";
import { METHOD_KEYS } from "../../form-labels";
import { receivePaymentAction, reversePaymentAction } from "../../trade-actions";
import { Badge, cell, Field, money, PageHead, small, SmallLink, Table } from "../../ui";

// One customer (GearGrid plan 2.5, 8.1): what they owe, their details and price tier, and the ledger. A customer with
// nothing in the ledger can be removed (D173).

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = database();
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await customerDetail(db, id) : null;
  if (!detail) notFound();
  const [payments, accounts] = await Promise.all([customerPaymentList(db, id), accountOptions(db)]);
  const { customer, ledger, hasHistory } = detail;
  const page = await pageContext();
  const { t, taka } = page;
  const f = (name: string) => t(`fields.${name}`);
  const due = BigInt(customer.due_balance);
  const limit = customer.credit_limit === null ? null : BigInt(customer.credit_limit);
  const used = limit !== null && limit > 0n ? Math.max(0, Number((due * 100n) / limit)) : null;
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
      >
        <SmallLink href={`/reports/customer_statement?party=${customer.id}`}>
          {t("reports.statement")}
        </SmallLink>
        <SmallLink href={`/audit?entity=customer&id=${customer.id}`}>{t("audit.history")}</SmallLink>
      </PageHead>
      {/* The khata at a glance (D207): what is owed in large type, and how much of the credit limit it uses. */}
      <section className="card flex flex-wrap items-center gap-x-10 gap-y-4">
        <div className="flex flex-col gap-1">
          <span className="text-stone-600">{t("customers.due")}</span>
          <strong
            data-testid="customer-due"
            className={`figure text-4xl leading-tight font-bold ${due > 0n ? "text-red-700" : ""}`}
          >
            {taka(due)}
          </strong>
        </div>
        <div className="flex min-w-60 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-stone-600">
              {t("customers.credit_limit")}:{" "}
              <span className="font-semibold text-stone-900">
                {limit === null ? t("customers.no_limit") : taka(limit)}
              </span>
            </span>
            <Badge tone="brand">{t(`value.price_tier.${customer.price_tier}`)}</Badge>
          </div>
          {used !== null && (
            <div className="flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${used >= 100 ? "bg-red-700" : used >= 80 ? "bg-amber-500" : "bg-brand"}`}
                  style={{ width: `${Math.min(100, used)}%` }}
                />
              </div>
              <span className="text-sm whitespace-nowrap text-stone-600">
                {t("customers.limit_used", { percent: used })}
              </span>
            </div>
          )}
        </div>
      </section>

      {customer.due_balance !== "0" && (
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{t("payment.receive")}</h2>
          <ActionForm action={receivePaymentAction} reset className="grid gap-3 md:grid-cols-4 md:items-end">
            <input type="hidden" name="customerId" value={customer.id} />
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
                {accounts.map((account) => (
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
                {t("payment.receive")}
              </button>
            </div>
          </ActionForm>
        </section>
      )}

      {payments.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{t("payment.list")}</h2>
          <Table
            right={[1]}
            head={[t("part.date"), t("sale.amount"), t("sale.method"), t("sale.account"), ""]}
          >
            {payments.map((payment) => (
              <tr key={payment.id} className={payment.status === "reversed" ? "text-stone-400" : ""}>
                <td className={cell}>{page.date(payment.received_at)}</td>
                <td className={money}>{taka(BigInt(payment.amount))}</td>
                <td className={cell}>
                  {t(`value.method.${payment.method}`)}
                  {payment.trx_id ? ` · ${payment.trx_id}` : ""}
                </td>
                <td className={cell}>{payment.account ?? t("form.none")}</td>
                <td className={cell}>
                  {payment.status === "reversed" ? (
                    <span>
                      {t("value.payment_status.reversed")}
                      {payment.reversal_reason ? `: ${payment.reversal_reason}` : ""}
                    </span>
                  ) : (
                    <ActionForm action={reversePaymentAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={payment.id} />
                      <input type="hidden" name="customerId" value={customer.id} />
                      <input
                        name="reason"
                        required
                        maxLength={200}
                        placeholder={t("payment.reason")}
                        aria-label={t("payment.reason")}
                        className="rounded-lg border border-stone-300 px-2 py-1.5"
                      />
                      <button type="submit" className={small}>
                        {t("payment.reverse")}
                      </button>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}

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
