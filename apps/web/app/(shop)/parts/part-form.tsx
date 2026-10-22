import { PART_POSITIONS, PART_QUALITIES, PART_UNITS, PART_VEHICLE_TYPES } from "@geargrid/db";
import { database } from "../../../src/server/db";
import { brandOptions, categoryOptions, type PartDetail } from "../../../src/server/services/catalog-reads";
import { pageContext } from "../../../src/web/page-context";
import { ActionForm } from "../action-form";
import { createPartAction, updatePartAction } from "../catalog-actions";
import { Check, Field } from "../ui";

// The part record form (GearGrid plan 2.1), for a new part and for editing one. Prices are whole taka; an empty garage
// price means the retail price is used (D144).

export async function PartForm({ part }: { part?: PartDetail["part"] }) {
  const { t } = await pageContext();
  const db = database();
  const [categories, brands] = await Promise.all([categoryOptions(db), brandOptions(db)]);
  const f = (name: string) => t(`fields.${name}`);
  const number = (value: string | null | undefined) =>
    value === null || value === undefined ? "" : String(Number(value));
  return (
    <ActionForm action={part ? updatePartAction : createPartAction} className="max-w-3xl space-y-6">
      {part && <input type="hidden" name="partId" value={part.id} />}
      <section className="card grid gap-4 md:grid-cols-2">
        <Field label={f("nameEn")}>
          <input name="nameEn" defaultValue={part?.name_en} required maxLength={150} className="field" />
        </Field>
        <Field label={f("nameBn")} hint={t("form.optional")}>
          <input name="nameBn" defaultValue={part?.name_bn ?? ""} maxLength={150} className="field" />
        </Field>
        {!part && (
          <Field label={f("mainNumber")} hint={t("form.optional")}>
            <input name="mainNumber" maxLength={40} className="field" />
          </Field>
        )}
        <Field label={f("categoryId")}>
          <select name="categoryId" defaultValue={part?.category_id} required className="field">
            {categories.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={f("brandId")}>
          <select name="brandId" defaultValue={part?.brand_id ?? ""} className="field">
            <option value="">{t("part.no_brand")}</option>
            {brands.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={f("newBrand")} hint={t("part.new_brand_hint")}>
          <input name="newBrand" maxLength={60} className="field" />
        </Field>
        <Field label={f("vehicleType")}>
          <select name="vehicleType" defaultValue={part?.vehicle_type ?? "car"} className="field">
            {PART_VEHICLE_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`value.vehicle_type.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={f("quality")}>
          <select name="quality" defaultValue={part?.quality ?? "genuine"} className="field">
            {PART_QUALITIES.map((value) => (
              <option key={value} value={value}>
                {t(`value.quality.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={f("position")}>
          <select name="position" defaultValue={part?.position ?? ""} className="field">
            <option value="">{t("part.no_position")}</option>
            {PART_POSITIONS.map((value) => (
              <option key={value} value={value}>
                {t(`value.position.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={f("unit")}>
          <select name="unit" defaultValue={part?.unit ?? "piece"} className="field">
            {PART_UNITS.map((value) => (
              <option key={value} value={value}>
                {t(`value.unit.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={f("packSize")} hint={t("form.optional")}>
          <input
            name="packSize"
            defaultValue={number(part?.pack_size)}
            inputMode="decimal"
            className="field"
          />
        </Field>
        <Field label={f("rackLocation")} hint={t("form.optional")}>
          <input
            name="rackLocation"
            defaultValue={part?.rack_location ?? ""}
            maxLength={20}
            className="field"
          />
        </Field>
      </section>
      <section className="card grid gap-4 md:grid-cols-3">
        <Field label={f("retailPrice")}>
          <input
            name="retailPrice"
            defaultValue={number(part?.retail_price)}
            required
            inputMode="numeric"
            className="field"
          />
        </Field>
        <Field label={f("garagePrice")} hint={t("part.garage_blank")}>
          <input
            name="garagePrice"
            defaultValue={number(part?.garage_price)}
            inputMode="numeric"
            className="field"
          />
        </Field>
        <Field label={f("reorderLevel")}>
          <input
            name="reorderLevel"
            defaultValue={number(part?.reorder_level ?? "0")}
            inputMode="decimal"
            className="field"
          />
        </Field>
        <Field label={f("notes")} hint={t("form.optional")} className="md:col-span-3">
          <textarea
            name="notes"
            defaultValue={part?.notes ?? ""}
            maxLength={500}
            rows={2}
            className="field py-2"
          />
        </Field>
        <Check name="isActive" label={f("isActive")} defaultChecked={part?.is_active ?? true} />
      </section>
      {!part && <p className="text-stone-600">{t("part.no_stock_hint")}</p>}
      <button type="submit" className="button-primary">
        {t("common.save")}
      </button>
    </ActionForm>
  );
}
