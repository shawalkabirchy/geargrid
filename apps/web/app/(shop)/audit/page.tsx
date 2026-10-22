import { AUDIT_LOG_SOURCES } from "@geargrid/db";
import Link from "next/link";
import { database } from "../../../src/server/db";
import { auditEntities, auditLog, entityLink } from "../../../src/server/services/audit-reads";
import { pageContext } from "../../../src/web/page-context";
import { cell, Field, PageHead, Table } from "../ui";

// The history of changes (GearGrid plan 2.12): who changed what and from where — this dashboard, an API key,
// DokaanBondhu AI or the phone — with the old and new values; filtered by source or by one record.

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

const BADGE: Record<string, string> = {
  web: "bg-brand-soft text-brand-ink",
  ai: "bg-amber-100 text-amber-900",
  api: "bg-sky-100 text-sky-900",
  mobile: "bg-violet-100 text-violet-900",
};

export default async function AuditPage({ searchParams }: { searchParams: Search }) {
  const search = await searchParams;
  const source = (AUDIT_LOG_SOURCES as readonly string[]).includes(one(search.source))
    ? (one(search.source) as (typeof AUDIT_LOG_SOURCES)[number])
    : null;
  const entity = /^[a-z_]{1,40}$/.test(one(search.entity)) ? one(search.entity) : null;
  const entityId = /^[0-9a-f-]{36}$/i.test(one(search.id)) ? one(search.id) : null;
  const { t, date, digits } = await pageContext();
  const db = database();
  const [log, entities] = await Promise.all([
    auditLog(db, { source, entity, entityId, before: one(search.before) || null }),
    auditEntities(db),
  ]);
  const time = (at: Date) =>
    digits(at.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }));
  const next = new URLSearchParams({
    ...(source ? { source } : {}),
    ...(entity ? { entity } : {}),
    ...(entityId ? { id: entityId } : {}),
    before: log.rows.at(-1)?.id ?? "",
  });

  return (
    <div className="space-y-6">
      <PageHead title={t("audit.title")} />
      <p className="text-stone-600">{t("audit.intro")}</p>
      <form className="card flex flex-wrap items-end gap-3">
        <Field label={t("audit.source")}>
          <select name="source" defaultValue={source ?? ""} className="field">
            <option value="">{t("cheques.all")}</option>
            {AUDIT_LOG_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`value.audit_source.${s}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("audit.entity")}>
          <select name="entity" defaultValue={entity ?? ""} className="field">
            <option value="">{t("cheques.all")}</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {t(`value.entity.${e}`, { defaultValue: e })}
              </option>
            ))}
          </select>
        </Field>
        {entityId && <input type="hidden" name="id" value={entityId} />}
        <button type="submit" className="button-primary">
          {t("form.search")}
        </button>
        {(source || entity || entityId) && (
          <Link href="/audit" className="text-brand-ink underline">
            {t("audit.clear")}
          </Link>
        )}
      </form>

      <section className="card">
        {log.rows.length === 0 ? (
          <p className="text-stone-600">{t("audit.none")}</p>
        ) : (
          <Table head={[t("part.date"), t("audit.who"), t("audit.what"), t("audit.record"), ""]}>
            {log.rows.map((row) => {
              const link = entityLink(row.entity, row.entity_id, row.after);
              const who = row.user_name ?? row.acting_user ?? row.key_name ?? t("form.none");
              return (
                <tr key={row.id} data-testid="audit-row" className="align-top">
                  <td className={cell}>
                    {date(row.created_at)}{" "}
                    <span className="text-sm text-stone-500">{time(row.created_at)}</span>
                  </td>
                  <td className={cell}>
                    <span className={`rounded px-2 py-0.5 text-sm ${BADGE[row.source] ?? "bg-stone-100"}`}>
                      {t(`value.audit_source.${row.source}`, { defaultValue: row.source })}
                    </span>
                    <div className="text-sm text-stone-600">{who}</div>
                  </td>
                  <td className={cell}>
                    {t(`value.audit_action.${row.action}`, { defaultValue: row.action })}
                  </td>
                  <td className={cell}>
                    {link ? (
                      <Link href={link} className="text-brand-ink hover:underline">
                        {t(`value.entity.${row.entity}`, { defaultValue: row.entity })}
                      </Link>
                    ) : (
                      t(`value.entity.${row.entity}`, { defaultValue: row.entity })
                    )}
                  </td>
                  <td className={cell}>
                    {(row.before !== null || row.after !== null) && (
                      <details>
                        <summary className="cursor-pointer text-sm text-brand-ink">
                          {t("audit.details")}
                        </summary>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {row.before !== null && (
                            <div>
                              <div className="text-sm text-stone-500">{t("audit.before")}</div>
                              <pre className="max-w-md overflow-x-auto rounded bg-stone-100 p-2 text-xs">
                                {JSON.stringify(row.before, null, 1)}
                              </pre>
                            </div>
                          )}
                          {row.after !== null && (
                            <div>
                              <div className="text-sm text-stone-500">{t("audit.after")}</div>
                              <pre className="max-w-md overflow-x-auto rounded bg-stone-100 p-2 text-xs">
                                {JSON.stringify(row.after, null, 1)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        {log.more && (
          <Link href={`/audit?${next.toString()}`} className="mt-3 inline-block text-brand-ink underline">
            {t("audit.older")}
          </Link>
        )}
      </section>
    </div>
  );
}
