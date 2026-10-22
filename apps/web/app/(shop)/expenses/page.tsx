import { addDays, dhakaDate } from "@geargrid/core";
import { database } from "../../../src/server/db";
import { allAccounts, expenseCategoryOptions, listExpenses } from "../../../src/server/services/money";
import { pageContext } from "../../../src/web/page-context";
import { ActionForm } from "../action-form";
import { addCategoryAction, addDefaultCategoriesAction, addExpenseAction } from "../money-actions";
import { cell, Field, money, PageHead, Table } from "../ui";

// Expenses (GearGrid plan 2.8): rent, electricity, transport, labour, tea and snacks and others, each paid from an
// account; the list of a range of days (this month by default) with its total.

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export default async function ExpensesPage({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const today = dhakaDate(new Date());
  const from = isDate(one(search.from)) ? one(search.from) : `${today.slice(0, 8)}01`;
  const to = isDate(one(search.to)) ? one(search.to) : today;
  const { t, taka, date, language } = await pageContext();
  const db = database();
  const [rows, categories, accounts] = await Promise.all([
    listExpenses(db, from, addDays(to, 0)),
    expenseCategoryOptions(db),
    allAccounts(db),
  ]);
  const name = (en: string, bn: string | null) => (language === "bn" && bn ? bn : en);
  const f = (key: string) => t(`fields.${key}`);
  const total = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);

  return (
    <div className="space-y-6">
      <PageHead title={t("expenses.title")} />
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("expenses.add")}</h2>
        {categories.length === 0 ? (
          <div className="space-y-3">
            <p className="text-stone-600">{t("expenses.no_categories")}</p>
            <ActionForm action={addDefaultCategoriesAction}>
              <button type="submit" className="button-primary">
                {t("expenses.add_defaults")}
              </button>
            </ActionForm>
          </div>
        ) : (
          <ActionForm
            action={addExpenseAction}
            reset
            className="grid gap-3 md:grid-cols-[1fr_1fr_9rem_10rem_1fr_auto] md:items-end"
          >
            <Field label={f("categoryId")}>
              <select name="categoryId" className="field">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {name(c.name_en, c.name_bn)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={f("accountId")}>
              <select name="accountId" className="field">
                {accounts
                  .filter((a) => a.is_active)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={f("amount")}>
              <input name="amount" required inputMode="numeric" className="field" />
            </Field>
            <Field label={f("date")}>
              <input type="date" name="date" defaultValue={today} max={today} required className="field" />
            </Field>
            <Field label={f("note")} hint={t("form.optional")}>
              <input name="note" maxLength={200} className="field" />
            </Field>
            <button type="submit" className="button-primary">
              {t("form.add")}
            </button>
          </ActionForm>
        )}
      </section>

      <form className="card grid gap-3 md:grid-cols-[10rem_10rem_auto] md:items-end">
        <Field label={t("sale.from")}>
          <input type="date" name="from" defaultValue={from} className="field" />
        </Field>
        <Field label={t("sale.to")}>
          <input type="date" name="to" defaultValue={to} className="field" />
        </Field>
        <button type="submit" className="button-primary">
          {t("form.search")}
        </button>
      </form>

      <section className="card">
        <p className="mb-2 text-lg">
          {t("expenses.total")}: <strong data-testid="expense-total">{taka(total)}</strong>
        </p>
        {rows.length === 0 ? (
          <p className="text-stone-600">{t("expenses.none")}</p>
        ) : (
          <Table head={[f("date"), f("categoryId"), f("accountId"), f("note"), f("amount")]}>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className={cell}>{date(row.spent_at)}</td>
                <td className={cell}>{name(row.category, row.category_bn)}</td>
                <td className={cell}>{row.account}</td>
                <td className={cell}>{row.note ?? t("form.none")}</td>
                <td className={money}>{taka(BigInt(row.amount))}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      {categories.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{t("expenses.add_category")}</h2>
          <ActionForm action={addCategoryAction} reset className="flex flex-wrap items-end gap-3">
            <Field label={f("nameEn")}>
              <input name="nameEn" required maxLength={60} className="field" />
            </Field>
            <Field label={f("nameBn")} hint={t("form.optional")}>
              <input name="nameBn" maxLength={60} className="field" />
            </Field>
            <button type="submit" className="button-primary">
              {t("form.add")}
            </button>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
