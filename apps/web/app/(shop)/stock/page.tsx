import Link from "next/link";
import { database } from "../../../src/server/db";
import { deadStock, lowStock, stockValue, type StockRow } from "../../../src/server/services/stock";
import { pageContext } from "../../../src/web/page-context";
import { ButtonLink, cell, money, PageHead, Table } from "../ui";

// Stock (GearGrid plan 2.7, 8.1): the stock value at average cost, the low-stock list (at or below the reorder level)
// and the dead-stock list (no sale in 90 days). A part's own stock is adjusted on its page; a rack is counted on
// /stock/count.

export default async function StockPage() {
  const { t, taka, qty, date } = await pageContext();
  const db = database();
  const [value, low, dead] = await Promise.all([stockValue(db), lowStock(db), deadStock(db)]);
  const name = (row: StockRow) => (
    <Link href={`/parts/${row.id}`} className="font-medium text-brand-ink hover:underline">
      {row.name_bn ?? row.name_en}
    </Link>
  );
  return (
    <div className="space-y-6">
      <PageHead title={t("stock.title")}>
        <ButtonLink href="/stock/count">{t("stock.count")}</ButtonLink>
      </PageHead>
      <section className="card text-lg">
        {t("stock.value")}: <strong data-testid="stock-value">{taka(value.value)}</strong>{" "}
        <span className="text-stone-500">{t("stock.value_parts", { count: value.parts })}</span>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("stock.low")}</h2>
        {low.length === 0 ? (
          <p className="text-stone-600">{t("stock.none_low")}</p>
        ) : (
          <Table head={[t("parts.part"), t("parts.rack"), t("parts.stock"), t("stock.reorder")]}>
            {low.map((row) => (
              <tr key={row.id} data-testid="low-row">
                <td className={cell}>
                  {name(row)}
                  <div className="text-sm text-stone-500">{row.number}</div>
                </td>
                <td className={cell}>{row.rack_location ?? t("form.none")}</td>
                <td className={`${cell} tabular-nums ${Number(row.stock) <= 0 ? "text-red-700" : ""}`}>
                  {qty(row.stock)} {t(`value.unit.${row.unit}`)}
                </td>
                <td className={`${cell} tabular-nums`}>{qty(row.reorder_level)}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("stock.dead")}</h2>
        {dead.length === 0 ? (
          <p className="text-stone-600">{t("stock.none_dead")}</p>
        ) : (
          <Table head={[t("parts.part"), t("parts.stock"), t("stock.worth"), t("stock.last_sale")]}>
            {dead.map((row) => (
              <tr key={row.id}>
                <td className={cell}>{name(row)}</td>
                <td className={`${cell} tabular-nums`}>
                  {qty(row.stock)} {t(`value.unit.${row.unit}`)}
                </td>
                <td className={money}>
                  {taka(BigInt(Math.round(Number(row.stock) * Number(row.avg_cost))))}
                </td>
                <td className={cell}>{row.last_sale ? date(row.last_sale) : t("stock.never")}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
