import { VEHICLE_TYPES } from "@geargrid/db";
import { database } from "../../../src/server/db";
import { listVehicles } from "../../../src/server/services/catalog-reads";
import { pageContext } from "../../../src/web/page-context";
import { ActionForm } from "../action-form";
import { addVehicleAction } from "../catalog-actions";
import { cell, Field, PageHead, Table } from "../ui";

// The vehicle list (GearGrid plan 2.2): the starter models and those the shop adds, with how many parts fit each.

export default async function VehiclesPage() {
  const { t, digits } = await pageContext();
  const vehicles = await listVehicles(database());
  const f = (name: string) => t(`fields.${name}`);
  return (
    <div className="space-y-6">
      <PageHead title={t("vehicles.title")} />
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("vehicles.add")}</h2>
        <ActionForm action={addVehicleAction} reset className="grid gap-3 md:grid-cols-4 md:items-end">
          <Field label={f("vehicleType")}>
            <select name="vehicleType" className="field">
              {VEHICLE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`value.vehicle_type.${value}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={f("make")}>
            <input name="make" required maxLength={40} className="field" />
          </Field>
          <Field label={f("model")}>
            <input name="model" required maxLength={60} className="field" />
          </Field>
          <Field label={f("engineCode")} hint={t("form.optional")}>
            <input name="engineCode" maxLength={30} className="field" />
          </Field>
          <Field label={f("yearFrom")}>
            <input name="yearFrom" required inputMode="numeric" className="field" />
          </Field>
          <Field label={f("yearTo")} hint={t("vehicles.year_to_blank")}>
            <input name="yearTo" inputMode="numeric" className="field" />
          </Field>
          <Field label={f("body")} hint={t("form.optional")}>
            <input name="body" maxLength={30} className="field" />
          </Field>
          <button type="submit" className="button-primary">
            {t("form.add")}
          </button>
        </ActionForm>
      </section>
      <section className="card">
        <Table
          head={[
            f("make"),
            f("model"),
            t("vehicles.years"),
            f("engineCode"),
            f("vehicleType"),
            t("vehicles.source"),
            t("vehicles.parts"),
          ]}
        >
          {vehicles.map((v) => (
            <tr key={v.id}>
              <td className={cell}>{v.make}</td>
              <td className={`${cell} font-medium`}>{v.model}</td>
              <td className={cell}>
                {digits(v.year_from)}–{v.year_to === null ? t("vehicles.still_made") : digits(v.year_to)}
              </td>
              <td className={cell}>{v.engine_code ?? t("form.none")}</td>
              <td className={cell}>{t(`value.vehicle_type.${v.vehicle_type}`)}</td>
              <td className={cell}>{t(`value.vehicle_source.${v.source}`)}</td>
              <td className={`${cell} tabular-nums`}>{digits(v.parts)}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
