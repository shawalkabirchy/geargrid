import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  HandCoins,
  Landmark,
  PackageX,
  ReceiptText,
  Smartphone,
  TrendingUp,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { addDays } from "@geargrid/core";
import { database } from "../../src/server/db";
import { homeOverview, TREND_DAYS, todaySummary } from "../../src/server/services/home";
import { pageContext } from "../../src/web/page-context";
import {
  AGE_COLOURS,
  CardHead,
  ColumnChart,
  Meter,
  MiniColumns,
  SegmentedBar,
  niceTop,
  type Column,
} from "./home-charts";
import { Badge, Empty } from "./ui";

// Home (GearGrid plan 8.1; look D207, charts D231): today in the indigo band, the sales in marigold, with yesterday
// and the last 14 days beside them; then the last 30 days' sales, the money in each account, the dues by age, the
// best sellers, the stock at a glance and the cheques due in the next seven days. Each card links to its full page.

const ACCOUNT_ICONS: Record<string, LucideIcon> = {
  cash: Banknote,
  bkash: Smartphone,
  nagad: Smartphone,
  rocket: Smartphone,
  bank: Landmark,
};

export default async function HomePage() {
  const { t, taka, date, qty, digits } = await pageContext();
  const now = new Date();
  const today = await todaySummary(database(), now);
  const overview = await homeOverview(database(), now);

  // Short money for an axis: 0, 500, 20 thousand, 1.5 lakh.
  const compact = (value: number) => {
    const one = (v: number) => digits(String(Math.round(v * 10) / 10));
    if (value >= 100_000) return t("home.lakh", { n: one(value / 100_000) });
    if (value >= 1_000) return t("home.thousand", { n: one(value / 1_000) });
    return digits(String(value));
  };
  const short = (day: string) => date(day).slice(0, 5); // dd/mm

  const days = overview.days;
  const yesterday = days.at(-2)?.sales ?? 0n;
  const totalSales = days.reduce((sum, day) => sum + day.sales, 0n);
  const totalProfit = days.reduce((sum, day) => sum + day.profit, 0n);
  const bestDay = days.reduce((best, day) => (day.sales > best.sales ? day : best), days[0]!);
  const top = niceTop(Math.max(...days.map((day) => Number(day.sales))));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ pct: f * 100, label: compact(top * f) }));
  const columns: Column[] = days.map((day, index) => {
    const isToday = index === days.length - 1;
    const labelled = (days.length - 1 - index) % 7 === 0;
    return {
      key: day.date,
      height: (Number(day.sales) / top) * 100,
      ...(labelled ? { label: isToday ? t("home.today") : short(day.date) } : {}),
      strong: isToday,
      value: taka(day.sales),
      lines: [date(day.date), t("home.trend_profit_of", { amount: taka(day.profit) })],
    };
  });
  const recent = days.slice(-14);
  const recentTop = Math.max(1, ...recent.map((day) => Number(day.sales)));

  const tiles = [
    { key: "profit", icon: TrendingUp, label: t("home.profit"), value: taka(today.profit) },
    { key: "cash", icon: Wallet, label: t("home.cash_in_hand"), value: taka(today.cashInHand) },
    { key: "dues", icon: HandCoins, label: t("home.dues_collected"), value: taka(today.duesCollected) },
    { key: "expenses", icon: ReceiptText, label: t("home.expenses"), value: taka(today.expenses) },
  ];

  const accountsTotal = today.accounts.reduce((sum, a) => sum + (a.balance > 0n ? a.balance : 0n), 0n);
  const dues = overview.dues;
  const ageNames = [
    t("home.age_upto", { days: 30 }),
    t("home.age_range", { from: 31, to: 60 }),
    t("home.age_range", { from: 61, to: 90 }),
    t("home.age_over", { days: 90 }),
  ];
  const ageParts = dues.ages.map((amount, index) => {
    const pct = dues.total > 0n ? (Number(amount) / Number(dues.total)) * 100 : 0;
    return {
      key: String(index),
      pct,
      share: `${digits(String(Math.round(pct)))}%`,
      title: `${ageNames[index]}: ${taka(amount)}`,
    };
  });
  const bestTop = Number(overview.best[0]?.amount ?? 1n) || 1;
  const from = addDays(today.date, -(TREND_DAYS - 1));
  const range = `from=${from}&to=${today.date}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-3xl leading-tight font-bold">{t("home.title")}</h1>
        <span className="text-lg text-stone-600">{date(today.date)}</span>
      </header>

      <section
        aria-label={t("home.title")}
        className="relative overflow-hidden rounded-3xl bg-frame text-white shadow-[0_24px_48px_-24px_rgb(30_37_86/0.55)]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_0%_0%,rgb(58_71_168/0.75),transparent_60%),radial-gradient(60%_90%_at_100%_100%,rgb(244_180_0/0.10),transparent_70%)]"
        />
        <div className="relative grid gap-8 px-6 py-7 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center">
          <div data-testid="tile-sales" className="flex flex-col gap-1">
            <span className="text-frame-muted">{t("home.sales")}</span>
            <span className="text-5xl leading-tight font-bold text-marigold [font-stretch:87.5%] sm:text-6xl">
              {taka(today.sales)}
            </span>
            <span className="text-frame-muted">
              {t("home.sales_count", { count: today.salesCount })}
              <span aria-hidden="true"> · </span>
              {t("home.yesterday", { amount: taka(yesterday) })}
            </span>
            <div className="mt-4 max-w-sm">
              <MiniColumns heights={recent.map((day) => (Number(day.sales) / recentTop) * 100)} />
              <span className="mt-1.5 block text-sm text-frame-muted">
                {t("home.last_days", { days: 14 })}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map(({ key, icon: Icon, label, value }) => (
              <div
                key={key}
                data-testid={`tile-${key}`}
                className="flex flex-col gap-2 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10"
              >
                <span className="flex items-center gap-2 text-[15px] text-frame-muted">
                  <Icon className="size-[18px] shrink-0 text-frame-muted" aria-hidden="true" />
                  {label}
                </span>
                <span className="text-2xl leading-tight font-semibold [overflow-wrap:anywhere] [font-stretch:87.5%]">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="card min-w-0 p-6 lg:col-span-12 xl:col-span-8">
          <CardHead
            title={t("home.trend_title", { days: TREND_DAYS })}
            href={`/reports/profit_loss?${range}`}
            link={t("reports.name.profit_loss")}
          />
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {[
              { label: t("home.trend_total"), value: taka(totalSales) },
              { label: t("home.trend_profit"), value: taka(totalProfit) },
              { label: t("home.trend_average"), value: taka(totalSales / BigInt(days.length)) },
              {
                label: t("home.trend_best"),
                value: taka(bestDay.sales),
                sub: bestDay.sales > 0n ? date(bestDay.date) : undefined,
              },
            ].map((stat) => (
              <div key={stat.label} className="border-l-2 border-stone-200 pl-3">
                <dt className="text-sm text-stone-600">{stat.label}</dt>
                <dd className="text-xl font-semibold [font-stretch:87.5%]">{stat.value}</dd>
                {stat.sub && <dd className="text-sm text-stone-500">{stat.sub}</dd>}
              </div>
            ))}
          </dl>
          <ColumnChart label={t("home.trend_title", { days: TREND_DAYS })} columns={columns} ticks={ticks} />
          <details className="group mt-1">
            <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-lg px-2 font-semibold text-brand-ink hover:bg-brand-soft">
              {t("home.see_numbers")}
            </summary>
            <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-stone-200">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-stone-50 text-sm text-stone-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("home.day")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("home.trend_total")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("home.trend_profit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...days].reverse().map((day) => (
                    <tr key={day.date} className="border-t border-stone-200">
                      <td className="px-3 py-2">{date(day.date)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{taka(day.sales)}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${day.profit < 0n ? "text-red-700" : ""}`}
                      >
                        {taka(day.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="card min-w-0 p-6 lg:col-span-6 xl:col-span-4">
          <CardHead title={t("home.accounts")} href="/money" link={t("home.all_accounts")} />
          <p className="mt-4 text-sm text-stone-600">{t("home.accounts_total")}</p>
          <p className="text-3xl font-bold [font-stretch:87.5%]">{taka(accountsTotal)}</p>
          <ul className="mt-4 space-y-4">
            {today.accounts.map((account) => {
              const Icon = ACCOUNT_ICONS[account.kind] ?? Wallet;
              const share = accountsTotal > 0n ? (Number(account.balance) / Number(accountsTotal)) * 100 : 0;
              return (
                <li key={account.id} className="flex items-center gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate">{account.name}</span>
                      <span
                        className={`font-semibold whitespace-nowrap tabular-nums ${account.balance < 0n ? "text-red-700" : ""}`}
                      >
                        {taka(account.balance)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="w-full">
                        <Meter pct={share} />
                      </span>
                      <span className="w-10 shrink-0 text-right text-sm text-stone-500 tabular-nums">
                        {digits(String(Math.round(Math.max(0, share))))}%
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card min-w-0 p-6 lg:col-span-6">
          <CardHead title={t("home.dues_title")} href="/reports/customer_dues" link={t("home.dues_link")} />
          {dues.total === 0n ? (
            <p className="mt-4 text-stone-600">{t("home.no_dues")}</p>
          ) : (
            <>
              <p className="mt-4 flex flex-wrap items-baseline gap-x-3">
                <span className="text-3xl font-bold text-red-700 [font-stretch:87.5%]">
                  {taka(dues.total)}
                </span>
                <span className="text-stone-600">{t("home.dues_owed_by", { count: dues.customers })}</span>
              </p>
              <div className="mt-4">
                <SegmentedBar label={t("home.dues_title")} parts={ageParts} />
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4 lg:grid-cols-2">
                {ageNames.map((name, index) => (
                  <li key={name} className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-1 size-3 shrink-0 rounded-[3px]"
                      style={{ background: AGE_COLOURS[index] }}
                    />
                    <span>
                      <span className="block text-stone-600">{name}</span>
                      <span className="font-semibold text-stone-900 tabular-nums">
                        {taka(dues.ages[index]!)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-6 text-sm font-semibold text-stone-600">{t("home.owe_most")}</h3>
              <ul className="mt-1">
                {dues.top.map((debtor) => (
                  <li key={debtor.id} className="border-t border-stone-200 first:border-t-0">
                    <Link
                      href={`/customers/${debtor.id}`}
                      className="-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-stone-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-brand-ink">{debtor.name}</span>
                        <span className="block text-sm text-stone-500">
                          {t("home.days_old", { count: debtor.days })}
                        </span>
                      </span>
                      <span className="font-semibold whitespace-nowrap text-red-700 tabular-nums">
                        {taka(debtor.due)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card min-w-0 p-6 lg:col-span-6">
          <CardHead
            title={t("home.best_title", { days: TREND_DAYS })}
            href={`/reports/sales_by_part?${range}`}
            link={t("reports.name.sales_by_part")}
          />
          {overview.best.length === 0 ? (
            <div className="mt-4">
              <Empty>{t("home.no_best")}</Empty>
            </div>
          ) : (
            <ol className="mt-4 space-y-4">
              {overview.best.map((part, index) => (
                <li key={part.id} className="flex items-center gap-3">
                  <span
                    className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                      index === 0 ? "bg-brand text-white" : "bg-stone-100 text-stone-700"
                    }`}
                  >
                    {digits(String(index + 1))}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/parts/${part.id}`} className="truncate text-brand-ink hover:underline">
                        {part.name}
                      </Link>
                      <span className="font-semibold whitespace-nowrap tabular-nums">
                        {taka(part.amount)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="w-full">
                        <Meter pct={(Number(part.amount) / bestTop) * 100} />
                      </span>
                      <span className="shrink-0 text-sm whitespace-nowrap text-stone-500">
                        {t("home.sold_qty", { qty: qty(part.quantity) })}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card min-w-0 p-6 lg:col-span-6 xl:col-span-4">
          <CardHead title={t("home.stock_title")} href="/stock" link={t("home.stock_link")} />
          <p className="mt-4 text-sm text-stone-600">{t("stock.value")}</p>
          <p className="text-3xl font-bold [font-stretch:87.5%]">{taka(overview.stock.value)}</p>
          <p className="text-stone-600">{t("home.stock_parts", { count: overview.stock.parts })}</p>
          <ul className="mt-4 space-y-2">
            {[
              {
                key: "low",
                href: "/reports/low_stock",
                icon: TriangleAlert,
                label: t("stock.low"),
                count: overview.stock.low,
                tone: "bg-amber-50 text-amber-800",
              },
              {
                key: "dead",
                href: "/reports/dead_stock",
                icon: PackageX,
                label: t("reports.name.dead_stock"),
                count: overview.stock.dead,
                tone: "bg-stone-100 text-stone-700",
              },
            ].map(({ key, href, icon: Icon, label, count, tone }) => (
              <li key={key}>
                <Link
                  href={href}
                  className="-mx-2 flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-stone-50"
                >
                  <span
                    className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-brand-ink">{label}</span>
                  <span className="text-xl font-semibold tabular-nums">{digits(String(count))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card min-w-0 p-6 lg:col-span-12 xl:col-span-8">
          <CardHead title={t("home.cheques_due")} href="/cheques" link={t("home.all_cheques")} />
          {today.chequesDue.length === 0 ? (
            <div className="mt-4">
              <Empty>{t("home.no_cheques")}</Empty>
            </div>
          ) : (
            <ul className="mt-3">
              {today.chequesDue.map((cheque) => {
                const overdue = cheque.dueDate < today.date;
                const received = cheque.direction === "received";
                const Icon = received ? ArrowDownLeft : ArrowUpRight;
                return (
                  <li
                    key={cheque.id}
                    className="flex items-start gap-3 border-t border-stone-200 py-3 first:border-t-0 sm:items-center"
                  >
                    <span
                      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${
                        received ? "bg-paid-soft text-paid" : "bg-stone-100 text-stone-700"
                      }`}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    {/* On a phone the amount and the date go under the name; side by side from sm up. */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <div className="truncate">{cheque.party}</div>
                        <div className="text-sm text-stone-600">
                          {t(received ? "home.cheque_received" : "home.cheque_issued")}, {cheque.bank}{" "}
                          {cheque.chequeNo}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-col sm:items-end sm:gap-0 sm:text-right">
                        <div
                          className={`font-semibold whitespace-nowrap tabular-nums ${received ? "text-paid" : ""}`}
                        >
                          {taka(cheque.amount)}
                        </div>
                        <div className="flex items-center gap-2 text-sm whitespace-nowrap text-stone-600">
                          {overdue && <Badge tone="owed">{t("home.overdue")}</Badge>}
                          {date(cheque.dueDate)}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
