import { dhakaDate } from "@geargrid/core";
import { notFound } from "next/navigation";
import { database } from "../../../../src/server/db";
import { allAccounts, cashBook, closings } from "../../../../src/server/services/money";
import { pageContext } from "../../../../src/web/page-context";
import { ActionForm } from "../../action-form";
import { closeDayAction, editAccountAction } from "../../money-actions";
import { cell, Check, Field, money, PageHead, SmallLink, Table } from "../../ui";

// One account's cash book (GearGrid plan 2.8): the opening balance, every movement in and out, the closing balance
// for a range of days (today by default); the daily closing, where the owner enters the counted money; and the
// account's name, number and whether it is in use.

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export default async function CashBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Search;
}) {
  const { id } = await params;
  const db = database();
  const account = /^[0-9a-f-]{36}$/i.test(id) ? (await allAccounts(db)).find((a) => a.id === id) : undefined;
  if (!account) notFound();
  const search = await searchParams;
  const today = dhakaDate(new Date());
  const from = isDate(one(search.from)) ? one(search.from) : today;
  const to = isDate(one(search.to)) ? one(search.to) : from > today ? from : today;
  const { t, taka, date, digits } = await pageContext();
  const [book, past] = await Promise.all([cashBook(db, id, from, to), closings(db, id)]);
  const f = (name: string) => t(`fields.${name}`);
  const time = (at: Date) =>
    digits(at.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }));

  return (
    <div className="space-y-6">
      <PageHead title={`${t("money.cash_book")}: ${account.name}`}>
        <SmallLink href={`/reports/cash_book?party=${account.id}&from=${from}&to=${to}`}>
          {t("reports.excel")} / {t("reports.pdf")}
        </SmallLink>
      </PageHead>
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
        <p className="mb-3 flex flex-wrap gap-x-8 text-lg" data-testid="cash-book-summary">
          <span>
            {t("money.opening")}: {taka(book.opening)}
          </span>
          <span className="text-brand-ink">
            {t("money.money_in")}: {taka(book.moneyIn)}
          </span>
          <span className="text-red-700">
            {t("money.money_out")}: {taka(book.moneyOut)}
          </span>
          <strong>
            {t("money.closing")}: <span data-testid="cash-book-closing">{taka(book.closing)}</span>
          </strong>
        </p>
        {book.lines.length === 0 ? (
          <p className="text-stone-600">{t("money.no_moves")}</p>
        ) : (
          <Table
            right={[3, 4]}
            head={[
              t("part.date"),
              t("money.what"),
              t("part.bill"),
              t("money.money_in"),
              t("money.money_out"),
            ]}
          >
            {book.lines.map((line) => (
              <tr key={line.id}>
                <td className={cell}>
                  {date(line.created_at)}{" "}
                  <span className="text-sm text-stone-500">{time(line.created_at)}</span>
                </td>
                <td className={cell}>
                  {t(`value.ref.${line.ref_type}`, { defaultValue: line.ref_type })}
                  {line.note && <span className="text-sm text-stone-500"> · {line.note}</span>}
                </td>
                <td className={cell}>{line.reference ?? t("form.none")}</td>
                <td className={money}>{line.direction === "in" ? taka(BigInt(line.amount)) : ""}</td>
                <td className={money}>{line.direction === "out" ? taka(BigInt(line.amount)) : ""}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      {account.is_active && (
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{t("money.close_day")}</h2>
          <ActionForm
            action={closeDayAction}
            className="grid gap-3 md:grid-cols-[10rem_12rem_auto] md:items-end"
          >
            <input type="hidden" name="accountId" value={account.id} />
            <Field label={f("date")}>
              <input type="date" name="date" defaultValue={today} max={today} required className="field" />
            </Field>
            <Field label={f("counted")}>
              <input name="counted" required inputMode="numeric" className="field" />
            </Field>
            <button type="submit" className="button-primary">
              {t("money.close_day")}
            </button>
          </ActionForm>
          {past.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 font-semibold">{t("money.closings")}</h3>
              <Table
                right={[1, 2, 3]}
                head={[f("date"), t("money.expected"), f("counted"), t("money.difference")]}
              >
                {past.map((row) => (
                  <tr key={row.id}>
                    <td className={cell}>{date(row.date)}</td>
                    <td className={money}>{taka(BigInt(row.expected_balance))}</td>
                    <td className={money}>{taka(BigInt(row.counted_balance))}</td>
                    <td className={`${money} ${row.difference === "0" ? "" : "text-red-700"}`}>
                      {taka(BigInt(row.difference))}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("money.edit_account")}</h2>
        <ActionForm
          action={editAccountAction}
          className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end"
        >
          <input type="hidden" name="id" value={account.id} />
          <Field label={f("name")}>
            <input name="name" defaultValue={account.name} required maxLength={60} className="field" />
          </Field>
          <Field label={f("accountNumber")}>
            <input
              name="accountNumber"
              defaultValue={account.number ?? ""}
              maxLength={40}
              className="field"
            />
          </Field>
          <Check name="isActive" label={f("isActive")} defaultChecked={account.is_active} />
          <button type="submit" className="button-primary">
            {t("common.save")}
          </button>
        </ActionForm>
      </section>
    </div>
  );
}
