import { PART_NUMBER_KINDS } from "@geargrid/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "../../../../src/server/db";
import { listVehicles, partDetail } from "../../../../src/server/services/catalog-reads";
import { pageContext } from "../../../../src/web/page-context";
import { ActionForm } from "../../action-form";
import {
  addAliasAction,
  addFitmentAction,
  addNumberAction,
  removeAliasAction,
  removeFitmentAction,
  removeNumberAction,
} from "../../catalog-actions";
import { cell, Check, Field, money, PageHead, small, Table } from "../../ui";

// One part (GearGrid plan 8.1, "Part details"): its record and prices, numbers, shop words, the vehicles it fits and
// its stock history, with the owner's changes in place.

function Remove({
  action,
  id,
  partId,
  label,
}: {
  action: typeof removeNumberAction;
  id: string;
  partId: string;
  label: string;
}) {
  return (
    <ActionForm action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="partId" value={partId} />
      <button type="submit" className={small}>
        {label}
      </button>
    </ActionForm>
  );
}

export default async function PartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = database();
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await partDetail(db, id) : null;
  if (!detail) notFound();
  const { part, numbers, aliases, categoryAliases, fitments, movements } = detail;
  const { t, taka, qty, date, digits } = await pageContext();
  const vehicles = await listVehicles(db);
  const fitted = new Set(fitments.map((f) => f.vehicle_id));
  const years = (from: number, to: number | null) =>
    `${digits(from)}–${to === null ? t("vehicles.still_made") : digits(to)}`;
  const unit = t(`value.unit.${part.unit}`);

  return (
    <div className="space-y-6">
      <PageHead
        title={
          <>
            {part.name_bn ?? part.name_en}
            {part.name_bn && <span className="ml-2 text-lg font-normal text-stone-500">{part.name_en}</span>}
            {!part.is_active && (
              <span className="ml-2 rounded bg-stone-200 px-2 text-base text-stone-600">
                {t("parts.inactive")}
              </span>
            )}
          </>
        }
      >
        <Link href={`/parts/${part.id}/edit`} className="button-primary inline-flex items-center">
          {t("part.edit")}
        </Link>
      </PageHead>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{t("part.details")}</h2>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2">
            <dt className="text-stone-500">{t("fields.categoryId")}</dt>
            <dd>{part.category}</dd>
            <dt className="text-stone-500">{t("fields.brandId")}</dt>
            <dd>{part.brand ?? t("form.none")}</dd>
            <dt className="text-stone-500">{t("fields.vehicleType")}</dt>
            <dd>{t(`value.vehicle_type.${part.vehicle_type}`)}</dd>
            <dt className="text-stone-500">{t("fields.quality")}</dt>
            <dd>
              {t(`value.quality.${part.quality}`)}
              {part.position && ` · ${t(`value.position.${part.position}`)}`}
            </dd>
            <dt className="text-stone-500">{t("fields.rackLocation")}</dt>
            <dd>{part.rack_location ?? t("form.none")}</dd>
            <dt className="text-stone-500">{t("parts.stock")}</dt>
            <dd data-testid="part-stock" className={Number(part.stock) <= 0 ? "text-red-700" : ""}>
              {qty(part.stock)} {unit}
            </dd>
            <dt className="text-stone-500">{t("fields.reorderLevel")}</dt>
            <dd>
              {qty(part.reorder_level)} {unit}
            </dd>
            {part.pack_size && (
              <>
                <dt className="text-stone-500">{t("fields.packSize")}</dt>
                <dd>{qty(part.pack_size)}</dd>
              </>
            )}
            {part.notes && (
              <>
                <dt className="text-stone-500">{t("fields.notes")}</dt>
                <dd className="whitespace-pre-line">{part.notes}</dd>
              </>
            )}
          </dl>
        </section>
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{t("part.prices")}</h2>
          <dl className="grid grid-cols-[12rem_1fr] gap-y-2 text-lg">
            <dt className="text-stone-500">{t("fields.retailPrice")}</dt>
            <dd className="tabular-nums">{taka(BigInt(part.retail_price))}</dd>
            <dt className="text-stone-500">{t("fields.garagePrice")}</dt>
            <dd className="tabular-nums">
              {part.garage_price === null ? t("form.none") : taka(BigInt(part.garage_price))}
            </dd>
            <dt className="text-stone-500">{t("part.avg_cost")}</dt>
            <dd className="tabular-nums">{taka(BigInt(part.avg_cost))}</dd>
          </dl>
        </section>
      </div>

      <section className="card" data-testid="numbers">
        <h2 className="mb-3 text-lg font-semibold">{t("part.numbers")}</h2>
        <ul className="mb-4 space-y-2">
          {numbers.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg">{n.number}</span>
              <span className="text-sm text-stone-500">
                {t(`value.number_kind.${n.kind}`)}
                {n.brand && ` · ${n.brand}`}
              </span>
              {n.is_main && (
                <span className="rounded bg-brand-soft px-2 text-sm text-brand-ink">{t("part.main")}</span>
              )}
              <Remove action={removeNumberAction} id={n.id} partId={part.id} label={t("form.remove")} />
            </li>
          ))}
        </ul>
        <ActionForm
          action={addNumberAction}
          reset
          className="grid gap-3 md:grid-cols-[1fr_12rem_10rem_auto_auto] md:items-end"
        >
          <input type="hidden" name="partId" value={part.id} />
          <Field label={t("fields.number")}>
            <input name="number" required maxLength={40} className="field" />
          </Field>
          <Field label={t("fields.kind")}>
            <select name="kind" className="field">
              {PART_NUMBER_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`value.number_kind.${kind}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("fields.brand")}>
            <input name="brand" maxLength={60} className="field" />
          </Field>
          <Check name="isMain" label={t("fields.isMain")} />
          <button type="submit" className="button-primary">
            {t("form.add")}
          </button>
        </ActionForm>
      </section>

      <section className="card" data-testid="aliases">
        <h2 className="mb-3 text-lg font-semibold">{t("part.aliases")}</h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {aliases.map((alias) => (
            <li key={alias.id} className="flex items-center gap-2 rounded-lg bg-stone-100 py-1 pr-1 pl-3">
              {alias.alias_text}
              <Remove action={removeAliasAction} id={alias.id} partId={part.id} label="✕" />
            </li>
          ))}
        </ul>
        <ActionForm action={addAliasAction} reset className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="partId" value={part.id} />
          <Field label={t("fields.aliasText")}>
            <input name="aliasText" required maxLength={60} className="field" />
          </Field>
          <button type="submit" className="button-primary">
            {t("form.add")}
          </button>
        </ActionForm>
        {categoryAliases.length > 0 && (
          <p className="mt-3 text-stone-600">
            {t("part.category_aliases")}: {categoryAliases.map((alias) => alias.alias_text).join(", ")} ·{" "}
            <Link href="/aliases" className="text-brand-ink underline">
              {t("nav.aliases")}
            </Link>
          </p>
        )}
      </section>

      <section className="card" data-testid="fitments">
        <h2 className="mb-3 text-lg font-semibold">{t("part.fitment")}</h2>
        {fitments.length === 0 ? (
          <p className="mb-3 text-stone-600">{t("part.no_fitment")}</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {fitments.map((fit) => (
              <li key={fit.id} className="flex flex-wrap items-center gap-3">
                <span className="font-medium">
                  {fit.vehicle} {years(fit.year_from, fit.year_to)}
                  {fit.engine_code && ` · ${fit.engine_code}`}
                </span>
                <span className="text-sm text-stone-500">
                  {t(fit.verified ? "part.verified" : "part.unverified")} ·{" "}
                  {t(`value.fitment_source.${fit.source}`)}
                  {fit.note && ` · ${fit.note}`}
                </span>
                <Remove action={removeFitmentAction} id={fit.id} partId={part.id} label={t("form.remove")} />
              </li>
            ))}
          </ul>
        )}
        <ActionForm
          action={addFitmentAction}
          reset
          className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end"
        >
          <input type="hidden" name="partId" value={part.id} />
          <Field label={t("fields.vehicleId")}>
            <select name="vehicleId" required defaultValue="" className="field">
              <option value="" disabled>
                {t("part.pick_vehicle")}
              </option>
              {vehicles
                .filter((v) => !fitted.has(v.id))
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} {years(v.year_from, v.year_to)}
                    {v.engine_code ? ` · ${v.engine_code}` : ""}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t("fields.note")}>
            <input name="note" maxLength={200} className="field" />
          </Field>
          <Check name="verified" label={t("fields.verified")} />
          <button type="submit" className="button-primary">
            {t("form.add")}
          </button>
        </ActionForm>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">{t("part.stock_history")}</h2>
        {movements.length === 0 ? (
          <p className="text-stone-600">{t("part.no_movements")}</p>
        ) : (
          <Table
            head={[t("part.date"), t("part.reason"), t("part.bill"), t("part.change"), t("part.unit_cost")]}
          >
            {movements.map((m) => (
              <tr key={m.id}>
                <td className={cell}>{date(m.created_at)}</td>
                <td className={cell}>{t(`value.movement.${m.reason}`)}</td>
                <td className={cell}>{m.invoice_no ?? t("form.none")}</td>
                <td className={`${money} ${Number(m.qty_change) < 0 ? "text-red-700" : "text-brand-ink"}`}>
                  {Number(m.qty_change) > 0 ? "+" : "−"}
                  {qty(Math.abs(Number(m.qty_change)))}
                </td>
                <td className={money}>{m.unit_cost === null ? t("form.none") : taka(BigInt(m.unit_cost))}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
