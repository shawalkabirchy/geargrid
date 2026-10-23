import { ACCOUNT_KINDS } from "@geargrid/db";
import Link from "next/link";
import { database } from "../../../src/server/db";
import { allAccounts } from "../../../src/server/services/money";
import { pageContext } from "../../../src/web/page-context";
import { ActionForm } from "../action-form";
import { addAccountAction, transferAction } from "../money-actions";
import { cell, Field, money, PageHead, Table } from "../ui";

// Money (GearGrid plan 2.8, 8.1): every account with its balance and cash book, a transfer between two accounts
// (cash into the bank, a bKash cash-out) and a new account.

export default async function MoneyPage() {
  const { t, taka } = await pageContext();
  const accounts = await allAccounts(database());
  const active = accounts.filter((a) => a.is_active);
  const total = active.reduce((sum, a) => sum + BigInt(a.balance), 0n);
  const f = (name: string) => t(`fields.${name}`);
  const options = active.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name} · {taka(BigInt(a.balance))}
    </option>
  ));
  return (
    <div className="space-y-6">
      <PageHead title={t("money.title")} />
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("money.accounts")}</h2>
        <Table right={[3]} head={[f("name"), f("kind"), f("accountNumber"), t("money.balance"), ""]}>
          {accounts.map((a) => (
            <tr key={a.id} className={a.is_active ? "" : "text-stone-400"}>
              <td className={`${cell} font-medium`}>
                {a.name}
                {!a.is_active && <span className="ml-2 text-sm">({t("money.inactive")})</span>}
              </td>
              <td className={cell}>{t(`account_kind.${a.kind}`)}</td>
              <td className={cell}>{a.number ?? t("form.none")}</td>
              <td
                className={`${money} ${BigInt(a.balance) < 0n ? "text-red-700" : ""}`}
                data-testid={`balance-${a.name}`}
              >
                {taka(BigInt(a.balance))}
              </td>
              <td className={`${cell} text-right`}>
                <Link href={`/money/${a.id}`} className="text-brand-ink underline">
                  {t("money.open_cash_book")}
                </Link>
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={cell} colSpan={3}>
              {t("money.total")}
            </td>
            <td className={money}>{taka(total)}</td>
            <td className={cell} />
          </tr>
        </Table>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("money.transfer")}</h2>
        <ActionForm
          action={transferAction}
          reset
          className="grid gap-3 md:grid-cols-[1fr_1fr_10rem_1fr_auto] md:items-end"
        >
          <Field label={f("fromId")}>
            <select name="fromId" required className="field">
              {options}
            </select>
          </Field>
          <Field label={f("toId")}>
            <select name="toId" required defaultValue={active[1]?.id} className="field">
              {options}
            </select>
          </Field>
          <Field label={f("amount")}>
            <input name="amount" required inputMode="numeric" className="field" />
          </Field>
          <Field label={f("note")} hint={t("form.optional")}>
            <input name="note" maxLength={200} className="field" />
          </Field>
          <button type="submit" className="button-primary">
            {t("form.add")}
          </button>
        </ActionForm>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("money.add_account")}</h2>
        <ActionForm
          action={addAccountAction}
          reset
          className="grid gap-3 md:grid-cols-[1fr_10rem_1fr_10rem_auto] md:items-end"
        >
          <Field label={f("name")}>
            <input name="name" required maxLength={60} className="field" />
          </Field>
          <Field label={f("kind")}>
            <select name="kind" className="field">
              {ACCOUNT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`account_kind.${kind}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={f("accountNumber")} hint={t("form.optional")}>
            <input name="accountNumber" maxLength={40} className="field" />
          </Field>
          <Field label={f("openingBalance")} hint={t("money.opening_hint")}>
            <input name="openingBalance" inputMode="numeric" className="field" />
          </Field>
          <button type="submit" className="button-primary">
            {t("form.add")}
          </button>
        </ActionForm>
      </section>
    </div>
  );
}
