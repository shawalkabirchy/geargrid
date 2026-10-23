import { database } from "../../src/server/db";
import { todaySummary } from "../../src/server/services/home";
import { pageContext } from "../../src/web/page-context";
import { Badge } from "./ui";

// Home (GearGrid plan 8.1): today's sales, profit, cash in hand, account balances, dues collected, expenses and the
// cheques due in the next seven days. Today's figures sit in the indigo band, the sales in marigold (D207); New sale
// is the menu's main button on every page.

export default async function HomePage() {
  const { t, taka, date } = await pageContext();
  const today = await todaySummary(database(), new Date());
  const tiles = [
    { key: "profit", label: t("home.profit"), value: taka(today.profit) },
    { key: "cash", label: t("home.cash_in_hand"), value: taka(today.cashInHand) },
    { key: "dues", label: t("home.dues_collected"), value: taka(today.duesCollected) },
    { key: "expenses", label: t("home.expenses"), value: taka(today.expenses) },
  ];
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-3xl leading-tight font-bold">{t("home.title")}</h1>
        <span className="text-lg text-stone-600">{date(today.date)}</span>
      </header>

      <section
        aria-label={t("home.title")}
        className="flex flex-wrap items-end gap-x-10 gap-y-6 rounded-3xl bg-frame px-6 py-6 text-white sm:px-8 sm:py-7"
      >
        <div data-testid="tile-sales" className="flex flex-[2_1_16rem] flex-col gap-1">
          <span className="text-frame-muted">{t("home.sales")}</span>
          <span className="figure text-5xl leading-none font-bold text-marigold sm:text-6xl">
            {taka(today.sales)}
          </span>
          <span className="text-frame-muted">{t("home.sales_count", { count: today.salesCount })}</span>
        </div>
        <div className="grid flex-[3_1_26rem] grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-x-6 gap-y-5">
          {tiles.map((tile) => (
            <div
              key={tile.key}
              data-testid={`tile-${tile.key}`}
              className="flex flex-col gap-1 border-l border-white/20 pl-4"
            >
              <span className="text-[15px] text-frame-muted">{tile.label}</span>
              <span className="figure text-2xl font-semibold whitespace-nowrap">{tile.value}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card px-6 pb-3">
          <h2 className="mb-2 text-xl font-semibold">{t("home.accounts")}</h2>
          <table className="w-full">
            <tbody>
              {today.accounts.map((account) => (
                <tr key={account.id} className="border-t border-stone-200">
                  <td className="py-3">
                    {account.name}
                    <span className="block text-sm text-stone-600">{t(`account_kind.${account.kind}`)}</span>
                  </td>
                  <td
                    className={`py-3 text-right font-semibold tabular-nums ${account.balance < 0n ? "text-red-700" : ""}`}
                  >
                    {taka(account.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card px-6 pb-3">
          <h2 className="mb-2 text-xl font-semibold">{t("home.cheques_due")}</h2>
          {today.chequesDue.length === 0 ? (
            <p className="border-t border-stone-200 py-4 text-stone-600">{t("home.no_cheques")}</p>
          ) : (
            <table className="w-full">
              <tbody>
                {today.chequesDue.map((cheque) => {
                  const overdue = cheque.dueDate < today.date;
                  const received = cheque.direction === "received";
                  return (
                    <tr key={cheque.id} className="border-t border-stone-200">
                      <td className="py-3 pr-3">
                        <div>{cheque.party}</div>
                        <div className="text-sm text-stone-600">
                          {t(received ? "home.cheque_received" : "home.cheque_issued")}, {cheque.bank}{" "}
                          {cheque.chequeNo}
                        </div>
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <div className={`font-semibold tabular-nums ${received ? "text-paid" : ""}`}>
                          {taka(cheque.amount)}
                        </div>
                        <div className="text-sm text-stone-600">{date(cheque.dueDate)}</div>
                        {overdue && <Badge tone="owed">{t("home.overdue")}</Badge>}
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
