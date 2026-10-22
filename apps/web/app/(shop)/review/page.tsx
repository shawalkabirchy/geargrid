import Link from "next/link";
import { database } from "../../../src/server/db";
import { needsReview } from "../../../src/server/services/review";
import { pageContext } from "../../../src/web/page-context";
import { ActionForm } from "../action-form";
import { addTrxAction } from "../money-actions";
import { cell, money, PageHead, small, Table } from "../ui";

// Needs review (GearGrid plan 2.13 rule 8, 8.1): stock below zero, and mobile payments saved without a TrxID, where the
// owner adds it.

export default async function ReviewPage() {
  const { t, taka, qty, date } = await pageContext();
  const { negative, missingTrx } = await needsReview(database());
  return (
    <div className="space-y-6">
      <PageHead title={t("review.title")} />
      {negative.length === 0 && missingTrx.length === 0 && (
        <p className="card text-stone-600">{t("review.none")}</p>
      )}
      {negative.length > 0 && (
        <section className="card">
          <h2 className="mb-1 text-lg font-semibold">{t("review.negative")}</h2>
          <p className="mb-3 text-stone-600">{t("review.negative_hint")}</p>
          <Table head={[t("parts.part"), t("parts.stock")]}>
            {negative.map((row) => (
              <tr key={row.id}>
                <td className={cell}>
                  <Link href={`/parts/${row.id}`} className="text-brand-ink hover:underline">
                    {row.name_bn ?? row.name_en}
                  </Link>
                </td>
                <td className={`${cell} tabular-nums text-red-700`}>
                  {qty(row.stock)} {t(`value.unit.${row.unit}`)}
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}
      {missingTrx.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{t("review.missing_trx")}</h2>
          <Table head={[t("part.date"), t("money.what"), t("sale.method"), t("sale.amount"), ""]}>
            {missingTrx.map((row) => (
              <tr key={row.id} data-testid="missing-trx">
                <td className={cell}>{date(row.at)}</td>
                <td className={cell}>
                  {t(`value.ref.${row.kind}`)} ·{" "}
                  <Link href={row.link} className="text-brand-ink hover:underline">
                    {row.reference}
                  </Link>
                </td>
                <td className={cell}>{t(`value.method.${row.method}`)}</td>
                <td className={money}>{taka(BigInt(row.amount))}</td>
                <td className={cell}>
                  <ActionForm action={addTrxAction} className="flex items-center gap-2">
                    <input type="hidden" name="kind" value={row.kind} />
                    <input type="hidden" name="id" value={row.id} />
                    <input
                      name="trxId"
                      required
                      maxLength={64}
                      aria-label={t("sale.trx_id")}
                      placeholder={t("sale.trx_id")}
                      className="rounded-lg border border-stone-300 px-2 py-1.5"
                    />
                    <button type="submit" className={small}>
                      {t("review.add_trx")}
                    </button>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </div>
  );
}
