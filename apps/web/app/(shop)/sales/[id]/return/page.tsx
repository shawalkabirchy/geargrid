import { notFound } from "next/navigation";
import { database } from "../../../../../src/server/db";
import { accountOptions, saleDetail } from "../../../../../src/server/services/trade-reads";
import { pageContext } from "../../../../../src/web/page-context";
import { RETURN_LABELS } from "../../../form-labels";
import { PageHead } from "../../../ui";
import { ReturnForm } from "./return-form";

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = database();
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await saleDetail(db, id) : null;
  if (!detail || detail.sale.status === "void") notFound();
  const { t, labels, settings } = await pageContext();
  const accounts = (await accountOptions(db)).filter((account) => account.kind === "cash");
  return (
    <div>
      <PageHead title={`${t("return.title")} · ${detail.sale.invoice_no}`} />
      <ReturnForm
        saleId={detail.sale.id}
        hasCustomer={detail.sale.customer_id !== null}
        cashAccounts={accounts}
        banglaDigits={settings.banglaDigits}
        lines={detail.items
          .map((item) => ({
            id: item.id,
            name: item.name_bn ?? item.name_en,
            unit: t(`value.unit.${item.unit}`),
            left: Number(item.quantity) - Number(item.returned),
          }))
          .filter((line) => line.left > 0)}
        labels={{
          ...labels("return", RETURN_LABELS),
          taka: t("common.taka", { amount: "{{amount}}" }),
          account: t("sale.account"),
        }}
      />
    </div>
  );
}
