import { database } from "../../../../src/server/db";
import { listCustomers } from "../../../../src/server/services/party-reads";
import { accountOptions } from "../../../../src/server/services/trade-reads";
import { pageContext } from "../../../../src/web/page-context";
import { PageHead } from "../../ui";
import { METHOD_KEYS, SALE_LABELS } from "../../form-labels";
import { SaleForm } from "../sale-form";

export default async function NewSalePage() {
  const { t, labels, settings } = await pageContext();
  const db = database();
  const [customers, accounts] = await Promise.all([listCustomers(db), accountOptions(db)]);
  return (
    <div>
      <PageHead title={t("sale.new")} />
      <SaleForm
        customers={customers
          .map((c) => ({
            id: c.id,
            name: c.name,
            price_tier: c.price_tier,
            due_balance: c.due_balance,
            phone: c.phone,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        accounts={accounts}
        roundOffRule={settings.roundOffRule}
        banglaDigits={settings.banglaDigits}
        labels={{
          ...labels("sale", SALE_LABELS),
          taka: t("common.taka", { amount: "{{amount}}" }),
          remove: t("form.remove"),
          tier_retail: t("value.price_tier.retail"),
          tier_garage: t("value.price_tier.garage"),
        }}
        methodLabels={labels("value.method", METHOD_KEYS)}
      />
    </div>
  );
}
