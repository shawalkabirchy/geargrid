import { database } from "../../../../src/server/db";
import { rackParts, racks } from "../../../../src/server/services/stock";
import { pageContext } from "../../../../src/web/page-context";
import { ActionForm } from "../../action-form";
import { countStockAction } from "../../money-actions";
import { cell, Field, PageHead, Table } from "../../ui";

// Count by rack (GearGrid plan 2.7): pick a rack, type what is on it; each difference from the books becomes a
// "count" adjustment.

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function CountPage({ searchParams }: { searchParams: Search }) {
  const raw = (await searchParams).rack;
  const rack = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const { t, qty } = await pageContext();
  const db = database();
  const all = await racks(db);
  const rows = rack && all.includes(rack) ? await rackParts(db, rack) : [];
  return (
    <div className="space-y-6">
      <PageHead title={t("stock.count")} />
      <form className="card flex flex-wrap items-end gap-3">
        <Field label={t("stock.pick_rack")}>
          <select name="rack" defaultValue={rack} className="field">
            <option value="" disabled>
              {t("stock.pick_rack")}
            </option>
            {all.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="button-primary">
          {t("form.search")}
        </button>
      </form>
      {rows.length > 0 && (
        <ActionForm action={countStockAction} className="card space-y-4">
          <p className="text-stone-600">{t("stock.count_hint")}</p>
          <Table head={[t("parts.part"), t("stock.in_books"), t("fields.counted")]}>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className={cell}>
                  {row.name_bn ?? row.name_en}
                  <div className="text-sm text-stone-500">{row.number}</div>
                  <input type="hidden" name="partId" value={row.id} />
                </td>
                <td className={`${cell} tabular-nums`}>
                  {qty(row.stock)} {t(`value.unit.${row.unit}`)}
                </td>
                <td className={cell}>
                  <input
                    name={`counted:${row.id}`}
                    inputMode="decimal"
                    aria-label={`${t("fields.counted")} ${row.name_en}`}
                    className="field w-32"
                  />
                </td>
              </tr>
            ))}
          </Table>
          <button type="submit" className="button-primary">
            {t("stock.save_count")}
          </button>
        </ActionForm>
      )}
    </div>
  );
}
