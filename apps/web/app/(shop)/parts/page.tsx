import Link from "next/link";
import { database } from "../../../src/server/db";
import {
  carModels,
  SEARCH_LIMIT,
  searchParts,
  type CarFilter,
} from "../../../src/server/services/catalog-reads";
import { pageContext } from "../../../src/web/page-context";
import { Badge, ButtonLink, cell, Field, money, PageHead, RowCard, Table } from "../ui";

// Parts search (GearGrid plan 2.3, 8.1): one box for a name, a part number or a shop word, and the "by car model"
// picker; results with quality, stock, both prices and the rack. On a phone the results are cards (D243).

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
      <form
        className="card mb-4 grid grid-cols-[minmax(0,1fr)_6rem] gap-4 md:grid-cols-[1fr_16rem_8rem_auto] md:items-end"
        role="search"
      >
        <Field label={t("parts.search_label")} hint={t("parts.search_hint")} className="max-md:col-span-2">
          <input enterKeyHint="search" name="q" defaultValue={q} className="field" autoFocus />
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
        <button type="submit" className="button-primary max-md:col-span-2">
          {t("form.search")}
        </button>
      </form>

      <section className="card max-md:border-0 max-md:bg-transparent max-md:p-0">
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
            cards={hits.map((part) => {
              const out = Number(part.stock) <= 0;
              return (
                <RowCard
                  key={part.id}
                  href={`/parts/${part.id}`}
                  title={
                    <span className={part.is_active ? "" : "text-stone-400"}>
                      {part.name_bn ?? part.name_en}
                      {!part.is_active && (
                        <span className="ml-2 align-middle">
                          <Badge>{t("parts.inactive")}</Badge>
                        </span>
                      )}
                    </span>
                  }
                  amount={taka(BigInt(part.retail_price))}
                  sub={[part.main_number, part.brand].filter(Boolean).join(" · ")}
                  side={
                    <span className={`whitespace-nowrap ${out ? "font-semibold text-red-700" : ""}`}>
                      {t("parts.stock")} {qty(part.stock)} {t(`value.unit.${part.unit}`)}
                    </span>
                  }
                  extra={
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
                      <Badge tone={part.quality === "genuine" ? "brand" : "neutral"}>
                        {t(`value.quality.${part.quality}`)}
                      </Badge>
                      {part.garage_price !== null && (
                        <span>
                          {t("parts.garage")} {taka(BigInt(part.garage_price))}
                        </span>
                      )}
                      {part.rack_location && (
                        <span>
                          {t("parts.rack")} {part.rack_location}
                        </span>
                      )}
                    </div>
                  }
                />
              );
            })}
          >
            {hits.map((part) => (
              <tr key={part.id} className={part.is_active ? "" : "text-stone-400"}>
                <td className={`${cell} min-w-56`}>
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
