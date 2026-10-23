import Link from "next/link";
import { database } from "../../../src/server/db";
import {
  carModels,
  SEARCH_LIMIT,
  searchParts,
  type CarFilter,
} from "../../../src/server/services/catalog-reads";
import { pageContext } from "../../../src/web/page-context";
import { Badge, ButtonLink, cell, Field, money, PageHead, Table } from "../ui";

// Parts search (GearGrid plan 2.3, 8.1): one box for a name, a part number or a shop word, and the "by car model"
// picker; results with quality, stock, both prices and the rack.

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export default async function PartsPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const q = one(params.q).slice(0, 100);
  const carKey = one(params.car);
  const year = Number(one(params.year)) || undefined;
  const { t, taka, qty } = await pageContext();
  const db = database();
  const models = await carModels(db);
  const [make, model] = carKey.split("|");
  const car: CarFilter | undefined = make && model ? { make, model, year } : undefined;
  const hits = await searchParts(db, q, car);

  return (
    <div>
      <PageHead title={t("parts.title")}>
        <ButtonLink href="/parts/new">{t("parts.new")}</ButtonLink>
      </PageHead>
      <form className="card mb-4 grid gap-4 md:grid-cols-[1fr_16rem_8rem_auto] md:items-end" role="search">
        <Field label={t("parts.search_label")} hint={t("parts.search_hint")}>
          <input name="q" defaultValue={q} className="field" autoFocus />
        </Field>
        <Field label={t("parts.by_car")}>
          <select name="car" defaultValue={carKey} className="field">
            <option value="">{t("parts.any_model")}</option>
            {models.map((m) => (
              <option key={`${m.make}|${m.model}`} value={`${m.make}|${m.model}`}>
                {m.make} {m.model}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("parts.year")}>
          <input name="year" defaultValue={year ?? ""} inputMode="numeric" className="field" />
        </Field>
        <button type="submit" className="button-primary">
          {t("form.search")}
        </button>
      </form>

      <section className="card">
        <p className="mb-3 text-stone-600" data-testid="part-count">
          {hits.length === 0
            ? t("parts.none_found")
            : hits.length >= SEARCH_LIMIT
              ? t("parts.limited", { count: SEARCH_LIMIT })
              : t("parts.count", { count: hits.length })}
        </p>
        {hits.length > 0 && (
          <Table
            right={[2, 3, 4]}
            head={[
              t("parts.part"),
              t("fields.quality"),
              t("parts.stock"),
              t("parts.retail"),
              t("parts.garage"),
              t("parts.rack"),
            ]}
          >
            {hits.map((part) => (
              <tr key={part.id} className={part.is_active ? "" : "text-stone-400"}>
                <td className={cell}>
                  <Link href={`/parts/${part.id}`} className="font-medium text-brand-ink hover:underline">
                    {part.name_bn ?? part.name_en}
                  </Link>
                  {!part.is_active && (
                    <span className="ml-2">
                      <Badge>{t("parts.inactive")}</Badge>
                    </span>
                  )}
                  <div className="text-sm text-stone-500">
                    {part.name_bn ? `${part.name_en} · ` : ""}
                    {part.main_number}
                    {part.brand ? ` · ${part.brand}` : ""}
                  </div>
                </td>
                <td className={cell}>
                  <Badge tone={part.quality === "genuine" ? "brand" : "neutral"}>
                    {t(`value.quality.${part.quality}`)}
                  </Badge>
                  {part.position && (
                    <div className="mt-1 text-sm text-stone-500">{t(`value.position.${part.position}`)}</div>
                  )}
                </td>
                <td className={`${money} ${Number(part.stock) <= 0 ? "font-semibold text-red-700" : ""}`}>
                  {qty(part.stock)} {t(`value.unit.${part.unit}`)}
                </td>
                <td className={money}>{taka(BigInt(part.retail_price))}</td>
                <td className={money}>
                  {part.garage_price === null ? t("form.none") : taka(BigInt(part.garage_price))}
                </td>
                <td className={cell}>{part.rack_location ?? t("form.none")}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
