import { pageContext } from "../../../../src/web/page-context";
import { ActionForm } from "../../action-form";
import { addSupplierAction } from "../../party-actions";
import { Field, PageHead } from "../../ui";

export default async function NewSupplierPage() {
  const { t } = await pageContext();
  const f = (name: string) => t(`fields.${name}`);
  return (
    <div>
      <PageHead title={t("suppliers.new")} />
      <ActionForm action={addSupplierAction} className="card grid max-w-2xl gap-4 md:grid-cols-2">
        <Field label={f("name")}>
          <input name="name" required maxLength={100} className="field" />
        </Field>
        <Field label={f("phone")} hint={t("form.optional")}>
          <input name="phone" maxLength={20} inputMode="tel" className="field" />
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
