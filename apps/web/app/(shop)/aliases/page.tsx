import Link from "next/link";
import { database } from "../../../src/server/db";
import { categoryOptions, listAliases } from "../../../src/server/services/catalog-reads";
import { pageContext } from "../../../src/web/page-context";
import { ActionForm } from "../action-form";
import { addAliasAction, removeAliasAction } from "../catalog-actions";
import { cell, Field, PageHead, small, Table } from "../ui";

// Shop words (GearGrid plan 2.3): the names the shop calls parts by. A category word finds every part in it; a part's
// own words are added on its page. DokaanBondhu AI reads the same list (part_aliases).

export default async function AliasesPage() {
  const { t } = await pageContext();
  const db = database();
  const [aliases, categories] = await Promise.all([listAliases(db), categoryOptions(db)]);
  return (
    <div className="space-y-6">
      <PageHead title={t("aliases.title")} />
      <p className="max-w-3xl text-stone-600">{t("aliases.intro")}</p>
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("aliases.add_category")}</h2>
        <ActionForm
          action={addAliasAction}
          reset
          className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
        >
          <Field label={t("fields.aliasText")}>
            <input name="aliasText" required maxLength={60} className="field" />
          </Field>
          <Field label={t("fields.categoryId")}>
            <select name="categoryId" required className="field">
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className="button-primary">
            {t("form.add")}
          </button>
        </ActionForm>
      </section>
      <section className="card">
        <Table head={[t("fields.aliasText"), t("aliases.target"), ""]}>
          {aliases.map((alias) => (
            <tr key={alias.id}>
              <td className={`${cell} font-medium`}>{alias.alias_text}</td>
              <td className={cell}>
                {alias.part_id ? (
                  <Link href={`/parts/${alias.part_id}`} className="text-brand-ink underline">
                    {alias.target}
                  </Link>
                ) : (
                  alias.target
                )}
                <span className="ml-2 text-sm text-stone-500">
                  {t(alias.part_id ? "aliases.for_part" : "aliases.for_category")}
                </span>
              </td>
              <td className={`${cell} text-right`}>
                <ActionForm action={removeAliasAction} className="inline">
                  <input type="hidden" name="id" value={alias.id} />
                  <button type="submit" className={small}>
                    {t("form.remove")}
                  </button>
                </ActionForm>
              </td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
