import { database } from "../../../../src/server/db";
import { listSuppliers } from "../../../../src/server/services/party-reads";
import { accountOptions } from "../../../../src/server/services/trade-reads";
import { pageContext } from "../../../../src/web/page-context";
import { METHOD_KEYS, PURCHASE_LABELS, SALE_LABELS } from "../../form-labels";
import { PageHead } from "../../ui";
import { PurchaseForm } from "../purchase-form";

export default async function NewPurchasePage() {
  const { t, labels, settings } = await pageContext();
  const db = database();
  const [suppliers, accounts] = await Promise.all([listSuppliers(db), accountOptions(db)]);
  return (
    <div>
      <PageHead title={t("purchase.new")} />
      <PurchaseForm
        suppliers={suppliers
          .map((s) => ({ id: s.id, name: s.name }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        accounts={accounts}
        banglaDigits={settings.banglaDigits}
        labels={{
          ...labels("sale", SALE_LABELS),
          ...labels("purchase", PURCHASE_LABELS),
          taka: t("common.taka", { amount: "{{amount}}" }),
          remove: t("form.remove"),
        }}
        methodLabels={labels("value.method", METHOD_KEYS)}
      />
    </div>
  );
}
