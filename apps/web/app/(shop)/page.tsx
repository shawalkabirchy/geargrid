import { database } from "../../src/server/db";
import { todaySummary } from "../../src/server/services/home";
import { pageContext } from "../../src/web/page-context";

// Home (GearGrid plan 8.1): today's sales, profit, cash in hand, account balances, dues collected, expenses and the
// cheques due in the next seven days.

export default async function HomePage() {
  const { t, taka, date } = await pageContext();
  const today = await todaySummary(database(), new Date());
  const tiles = [
    {
      key: "sales",
      label: t("home.sales"),
      value: taka(today.sales),
      note: t("home.sales_count", { count: today.salesCount }),
    },
    { key: "profit", label: t("home.profit"), value: taka(today.profit) },
    { key: "cash", label: t("home.cash_in_hand"), value: taka(today.cashInHand) },
    { key: "dues", label: t("home.dues_collected"), value: taka(today.duesCollected) },
    { key: "expenses", label: t("home.expenses"), value: taka(today.expenses) },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {t("home.title")} <span className="font-normal text-stone-500">{date(today.date)}</span>
      </h1>
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.key} className="card" data-testid={`tile-${tile.key}`}>
            <div className="text-stone-600">{tile.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{tile.value}</div>
            {tile.note && <div className="text-sm text-stone-500">{tile.note}</div>}
          </div>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{t("home.accounts")}</h2>
          <table className="w-full">
            <tbody>
              {today.accounts.map((account) => (
                <tr key={account.id} className="border-t border-stone-100">
                  <td className="py-2">
                    {account.name}{" "}
                    <span className="text-sm text-stone-500">{t(`account_kind.${account.kind}`)}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{taka(account.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{t("home.cheques_due")}</h2>
          {today.chequesDue.length === 0 ? (
            <p className="text-stone-500">{t("home.no_cheques")}</p>
          ) : (
            <table className="w-full">
              <tbody>
                {today.chequesDue.map((cheque) => {
                  const overdue = cheque.dueDate < today.date;
                  return (
                    <tr key={cheque.id} className="border-t border-stone-100">
                      <td className="py-2">
                        <div>{cheque.party}</div>
                        <div className="text-sm text-stone-500">
                          {t(cheque.direction === "received" ? "home.cheque_received" : "home.cheque_issued")}{" "}
                          · {cheque.bank} {cheque.chequeNo}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <div className="tabular-nums">{taka(cheque.amount)}</div>
                        <div className={overdue ? "text-sm text-red-700" : "text-sm text-stone-500"}>
                          {date(cheque.dueDate)}
                          {overdue && ` · ${t("home.overdue")}`}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
