import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "../../../../src/server/db";
import { purchaseDetail } from "../../../../src/server/services/trade-reads";
import { pageContext } from "../../../../src/web/page-context";
import { ActionForm } from "../../action-form";
import { reversePurchaseAction } from "../../trade-actions";
import { cell, Field, money, PageHead, Table } from "../../ui";

// One purchase: the supplier, its lines and payments, and the reversal (spec 6.5, D93).

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await purchaseDetail(database(), id) : null;
  if (!detail) notFound();
  const { purchase, items, payments } = detail;
  const { t, taka, qty, date } = await pageContext();
  const reversed = purchase.status === "reversed";
  return (
    <div className="space-y-6">
      <PageHead
        title={
          <>
            {purchase.supplier} · {date(purchase.purchase_time)}
            {reversed && (
              <span className="ml-2 rounded bg-red-100 px-2 text-base text-red-800">
                {t("value.purchase_status.reversed")}
              </span>
            )}
          </>
        }
      />
      <section className="card">
        <p className="mb-3">
          {t("purchase.supplier")}:{" "}
          <Link href={`/suppliers/${purchase.supplier_id}`} className="text-brand-ink underline">
            {purchase.supplier}
          </Link>
          {purchase.bill_no && ` · ${t("purchase.bill_no")}: ${purchase.bill_no}`}
        </p>
        <Table head={[t("sale.part"), t("sale.qty"), t("purchase.unit_cost"), t("sale.line_total")]}>
          {items.map((item) => (
            <tr key={item.id}>
              <td className={cell}>
                <Link href={`/parts/${item.part_id}`} className="text-brand-ink hover:underline">
                  {item.name_bn ?? item.name_en}
                </Link>
              </td>
              <td className={`${cell} tabular-nums`}>
                {qty(item.quantity)} {t(`value.unit.${item.unit}`)}
              </td>
              <td className={money}>{taka(BigInt(item.unit_cost))}</td>
              <td className={money}>{taka(BigInt(item.line_total))}</td>
            </tr>
          ))}
        </Table>
        <dl className="mt-4 ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-y-1 text-lg">
          <dt className="font-bold">{t("sale.total")}</dt>
          <dd className="text-right font-bold tabular-nums">{taka(BigInt(purchase.total))}</dd>
          {payments.map((payment) => (
            <div key={payment.id} className="contents">
              <dt className="text-stone-600">
                {t(`value.method.${payment.method}`)}
                {payment.account ? ` · ${payment.account}` : ""}
              </dt>
              <dd className="text-right tabular-nums text-stone-600">{taka(BigInt(payment.amount))}</dd>
            </div>
          ))}
          <dt>{t("sale.paid")}</dt>
          <dd className="text-right tabular-nums">{taka(BigInt(purchase.paid))}</dd>
          <dt className="font-semibold">{t("suppliers.payable")}</dt>
          <dd className="text-right font-semibold tabular-nums">{taka(BigInt(purchase.due))}</dd>
        </dl>
      </section>
      {reversed ? (
        <p className="text-red-800">{t("purchase.reversed", { reason: purchase.reversal_reason ?? "" })}</p>
      ) : (
        <section className="card">
          <h2 className="mb-2 text-lg font-semibold">{t("purchase.reverse")}</h2>
          <p className="mb-3 text-stone-600">{t("purchase.reverse_hint")}</p>
          <ActionForm action={reversePurchaseAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={purchase.id} />
            <Field label={t("purchase.reverse_reason")} className="min-w-64 flex-1">
              <input name="reason" required maxLength={200} className="field" />
            </Field>
            <button
              type="submit"
              className="min-h-12 rounded-lg bg-red-700 px-5 text-lg font-semibold text-white"
            >
              {t("purchase.reverse")}
            </button>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
