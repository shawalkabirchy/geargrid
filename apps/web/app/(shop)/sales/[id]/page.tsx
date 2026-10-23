import { formatTaka } from "@geargrid/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "../../../../src/server/db";
import bnMessages from "../../../../src/server/http/messages/bn.json";
import enMessages from "../../../../src/server/http/messages/en.json";
import { saleDetail } from "../../../../src/server/services/trade-reads";
import { pageContext } from "../../../../src/web/page-context";
import { ActionForm } from "../../action-form";
import { voidSaleAction } from "../../trade-actions";
import { Badge, cell, Field, money, Table } from "../../ui";
import { PrintButton } from "../../print-button";

// One sale as its bill (GearGrid plan 8.1, appendix "Sample WhatsApp bill"): the shop, the lines, the totals and how it
// was paid; Print, a WhatsApp link with the bill as text, the return and the void (spec 6.5 rules).

/** A Bangladeshi mobile number for wa.me (8801XXXXXXXXX), or null. */
function whatsappNumber(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (/^01\d{9}$/.test(digits)) return `88${digits}`;
  if (/^8801\d{9}$/.test(digits)) return digits;
  return null;
}

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await saleDetail(database(), id) : null;
  if (!detail) notFound();
  const { sale, items, payments, returns } = detail;
  const { t, taka, qty, date, settings, language } = await pageContext();
  const warningTexts = (language === "en" ? enMessages : bnMessages).warnings as Record<string, string>;
  const isVoid = sale.status === "void";
  const returnable = items.some((item) => Number(item.quantity) > Number(item.returned));

  const plain = (amount: string) => `${formatTaka(BigInt(amount), { banglaDigits: settings.banglaDigits })}`;
  const bill = [
    settings.shopName,
    [settings.marketArea, settings.phone].filter(Boolean).join(" · "),
    `${t("sale.invoice")}: ${sale.invoice_no} · ${date(sale.sale_time)}`,
    sale.customer ? `${t("sale.customer")}: ${sale.customer}` : "",
    "",
    ...items.map(
      (item) => `${item.name_bn ?? item.name_en} × ${qty(item.quantity)} = ${plain(item.line_total)}`,
    ),
    "",
    sale.discount !== "0" ? `${t("sale.discount")}: ${plain(sale.discount)}` : "",
    `${t("sale.total")}: ${taka(BigInt(sale.total))}`,
    `${t("sale.paid")}: ${taka(BigInt(sale.paid))}`,
    sale.due !== "0" ? `${t("sale.due")}: ${taka(BigInt(sale.due))}` : "",
    "",
    t("sale.thanks"),
  ]
    .filter((line, index, all) => line !== "" || (all[index - 1] ?? "") !== "")
    .join("\n");
  const number = whatsappNumber(sale.customer_phone);
  const whatsapp = `https://wa.me/${number ?? ""}?text=${encodeURIComponent(bill)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 print:hidden">
        <PrintButton label={t("sale.print")} />
        <Link
          href={`/audit?entity=sale&id=${sale.id}`}
          className="inline-flex min-h-12 items-center rounded-lg border border-stone-300 px-3 hover:bg-stone-100"
        >
          {t("audit.history")}
        </Link>
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="button-primary inline-flex items-center"
        >
          {t("sale.whatsapp")}
        </a>
        {!isVoid && returnable && (
          <Link href={`/sales/${sale.id}/return`} className="button-primary inline-flex items-center">
            {t("sale.return")}
          </Link>
        )}
      </div>

      <article className="card mx-auto max-w-3xl print:shadow-none" data-testid="bill">
        <header className="mb-4 border-b border-stone-200 pb-3 text-center">
          <h1 className="text-2xl font-bold">{settings.shopName}</h1>
          <p className="text-stone-600">
            {[settings.marketArea, settings.address, settings.phone].filter(Boolean).join(" · ")}
          </p>
        </header>
        <div className="mb-4 flex flex-wrap justify-between gap-2">
          <div>
            {t("sale.invoice")}: <strong data-testid="invoice-no">{sale.invoice_no}</strong>
            {isVoid && (
              <span className="ml-2">
                <Badge tone="owed">{t("value.sale_status.void")}</Badge>
              </span>
            )}
          </div>
          <div>{date(sale.sale_time)}</div>
          <div className="w-full">
            {t("sale.customer")}:{" "}
            {sale.customer_id ? (
              <Link
                href={`/customers/${sale.customer_id}`}
                className="text-brand-ink underline print:no-underline"
              >
                {sale.customer}
              </Link>
            ) : (
              t("sale.walk_in")
            )}
          </div>
        </div>
        <Table right={[2, 3]} head={[t("sale.part"), t("sale.qty"), t("sale.price"), t("sale.line_total")]}>
          {items.map((item) => (
            <tr key={item.id}>
              <td className={cell}>
                {item.name_bn ?? item.name_en}
                <div className="text-sm text-stone-500">
                  {item.number}
                  {item.returned !== "0" && item.returned !== "0.000" && (
                    <span className="ml-2 text-amber-700">
                      {t("sale.returned", { qty: qty(item.returned) })}
                    </span>
                  )}
                </div>
              </td>
              <td className={`${cell} tabular-nums`}>
                {qty(item.quantity)} {t(`value.unit.${item.unit}`)}
              </td>
              <td className={money}>{taka(BigInt(item.unit_price))}</td>
              <td className={money}>{taka(BigInt(item.line_total))}</td>
            </tr>
          ))}
        </Table>
        <dl className="mt-4 ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-y-1 text-lg">
          <dt>{t("sale.subtotal")}</dt>
          <dd className="text-right tabular-nums">{taka(BigInt(sale.subtotal))}</dd>
          {sale.discount !== "0" && (
            <>
              <dt>{t("sale.discount")}</dt>
              <dd className="text-right tabular-nums">−{taka(BigInt(sale.discount))}</dd>
            </>
          )}
          {sale.round_off !== "0" && (
            <>
              <dt>{t("sale.round_off")}</dt>
              <dd className="text-right tabular-nums">{taka(BigInt(sale.round_off))}</dd>
            </>
          )}
          <dt className="text-xl font-bold">{t("sale.total")}</dt>
          <dd className="text-right text-xl font-bold tabular-nums">{taka(BigInt(sale.total))}</dd>
          {payments.map((payment) => (
            <div key={payment.id} className="contents">
              <dt className="text-stone-600">
                {t(`value.method.${payment.method}`)}
                {payment.trx_id ? ` · ${payment.trx_id}` : ""}
              </dt>
              <dd className="text-right tabular-nums text-stone-600">{taka(BigInt(payment.amount))}</dd>
            </div>
          ))}
          <dt>{t("sale.paid")}</dt>
          <dd className="text-right tabular-nums">{taka(BigInt(sale.paid))}</dd>
          <dt className="font-semibold">{t("sale.due")}</dt>
          <dd className="text-right font-semibold tabular-nums" data-testid="bill-due">
            {taka(BigInt(sale.due))}
          </dd>
        </dl>
        {sale.note && <p className="mt-3 text-stone-600">{sale.note}</p>}
        <p className="mt-6 text-center text-stone-600">{t("sale.thanks")}</p>
      </article>

      {isVoid && sale.void_reason && (
        <p className="text-center text-red-800">{t("sale.voided", { reason: sale.void_reason })}</p>
      )}
      {sale.flags.length > 0 && (
        <section className="card print:hidden">
          <h2 className="mb-2 font-semibold">{t("sale.flags")}</h2>
          <ul className="list-disc pl-6 text-amber-800">
            {sale.flags.map((flag) => (
              <li key={flag}>{warningTexts[flag] ?? flag}</li>
            ))}
          </ul>
        </section>
      )}
      {returns.length > 0 && (
        <section className="card print:hidden">
          <h2 className="mb-2 text-lg font-semibold">{t("sale.returns")}</h2>
          <Table
            right={[1, 2, 3]}
            head={[
              t("sale.date"),
              t("return.total"),
              t("return.refund_due"),
              t("return.refund_cash"),
              t("return.reason"),
            ]}
          >
            {returns.map((r) => (
              <tr key={r.id}>
                <td className={cell}>{date(r.return_time)}</td>
                <td className={money}>{taka(BigInt(r.total))}</td>
                <td className={money}>{taka(BigInt(r.refund_due))}</td>
                <td className={money}>{taka(BigInt(r.refund_cash))}</td>
                <td className={cell}>{r.reason ?? t("form.none")}</td>
              </tr>
            ))}
          </Table>
        </section>
      )}
      {!isVoid && returns.length === 0 && (
        <section className="card print:hidden">
          <h2 className="mb-2 text-lg font-semibold">{t("sale.void")}</h2>
          <p className="mb-3 text-stone-600">{t("sale.void_hint")}</p>
          <ActionForm action={voidSaleAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={sale.id} />
            <Field label={t("sale.void_reason")} className="min-w-64 flex-1">
              <input name="reason" required maxLength={200} className="field" />
            </Field>
            <button
              type="submit"
              className="min-h-12 rounded-lg bg-red-700 px-5 text-lg font-semibold text-white"
            >
              {t("sale.void")}
            </button>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
