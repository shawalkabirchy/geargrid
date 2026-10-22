import { pageContext } from "../../../../src/web/page-context";
import { ActionForm } from "../../action-form";
import { addCustomerAction } from "../../party-actions";
import { Field, PageHead } from "../../ui";

// A new customer (GearGrid plan 2.5): the price tier starts from the type (D144) and can be changed on its page.

export default async function NewCustomerPage() {
  const { t } = await pageContext();
  const f = (name: string) => t(`fields.${name}`);
  return (
    <div>
      <PageHead title={t("customers.new")} />
      <ActionForm action={addCustomerAction} className="card grid max-w-2xl gap-4 md:grid-cols-2">
        <Field label={f("name")}>
          <input name="name" required maxLength={100} className="field" />
        </Field>
        <Field label={f("type")}>
          <select name="type" className="field">
            <option value="retail">{t("value.customer_type.retail")}</option>
            <option value="garage">{t("value.customer_type.garage")}</option>
          </select>
        </Field>
        <Field label={f("phone")} hint={t("form.optional")}>
          <input name="phone" maxLength={20} inputMode="tel" className="field" />
        </Field>
        <Field label={f("creditLimit")} hint={t("customers.limit_blank")}>
          <input name="creditLimit" inputMode="numeric" className="field" />
        </Field>
        <Field label={f("address")} hint={t("form.optional")} className="md:col-span-2">
          <input name="address" maxLength={300} className="field" />
        </Field>
        <div>
          <button type="submit" className="button-primary">
            {t("common.save")}
          </button>
        </div>
      </ActionForm>
    </div>
  );
}
