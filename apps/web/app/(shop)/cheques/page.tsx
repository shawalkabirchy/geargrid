import { dhakaDate } from "@geargrid/core";
import { CHEQUE_STATUSES } from "@geargrid/db";
import Link from "next/link";
import { database } from "../../../src/server/db";
import { allAccounts, listCheques } from "../../../src/server/services/money";
import { pageContext } from "../../../src/web/page-context";
import { ActionForm } from "../action-form";
import { moveChequeAction } from "../money-actions";
import { cell, money, PageHead, small, smallDanger, Table } from "../ui";

// The cheque register (GearGrid plan 2.8, 2.11): cheques received from customers and issued to suppliers; a pending
// one is deposited, cleared into or out of a bank account, or bounced (its amount goes back on the ledger).

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ChequesPage({ searchParams }: { searchParams: Search }) {
  const raw = (await searchParams).status;
  const wanted = Array.isArray(raw) ? raw[0] : raw;
  const status = wanted && (CHEQUE_STATUSES as readonly string[]).includes(wanted) ? wanted : null;
  const { t, taka, date } = await pageContext();
  const db = database();
  const [rows, accounts] = await Promise.all([listCheques(db, status), allAccounts(db)]);
  const banks = accounts.filter((a) => a.kind === "bank" && a.is_active);
  const today = dhakaDate(new Date());

  return (
    <div className="space-y-6">
      <PageHead title={t("cheques.title")} />
      <nav className="flex flex-wrap gap-2">
        {[null, ...CHEQUE_STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/cheques?status=${s}` : "/cheques"}
            className={`rounded-lg px-3 py-1.5 ${s === status ? "bg-brand text-white" : "border border-stone-300 hover:bg-stone-100"}`}
          >
            {s ? t(`value.cheque_status.${s}`) : t("cheques.all")}
          </Link>
        ))}
      </nav>
      <p className="text-stone-600">{t("cheques.bounce_hint")}</p>
      <section className="card">
        {rows.length === 0 ? (
          <p className="text-stone-600">{t("cheques.none")}</p>
        ) : (
          <Table
            right={[4]}
            head={[
              t("cheques.due_date"),
              t("cheques.direction"),
              t("cheques.party"),
              t("cheques.bank"),
              t("sale.amount"),
              t("cheques.status"),
              "",
            ]}
          >
            {rows.map((c) => {
              const open = c.status === "pending" || c.status === "deposited";
              return (
                <tr key={c.id} data-testid="cheque-row">
                  <td className={`${cell} ${open && c.due_date < today ? "text-red-700" : ""}`}>
                    {date(c.due_date)}
                  </td>
                  <td className={cell}>{t(`value.cheque_direction.${c.direction}`)}</td>
                  <td className={cell}>
                    <Link
                      href={`/${c.party_type === "customer" ? "customers" : "suppliers"}/${c.party_id}`}
                      className="text-brand-ink hover:underline"
                    >
                      {c.party}
                    </Link>
                  </td>
                  <td className={cell}>
                    {c.bank} <span className="block text-sm text-stone-500">{c.cheque_no}</span>
                  </td>
                  <td className={money}>{taka(BigInt(c.amount))}</td>
                  <td className={cell}>{t(`value.cheque_status.${c.status}`)}</td>
                  <td className={cell}>
                    {open && (
                      <div className="flex flex-col items-start gap-2">
                        {c.direction === "received" && c.status === "pending" && (
                          <ActionForm action={moveChequeAction} className="inline">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="action" value="deposit" />
                            <button type="submit" className={small}>
                              {t("cheques.deposit")}
                            </button>
                          </ActionForm>
                        )}
                        <ActionForm action={moveChequeAction} className="flex flex-col items-start gap-2">
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="action" value="clear" />
                          <select
                            name="accountId"
                            aria-label={t("cheques.into_account")}
                            className="field mt-0 min-h-10 w-44 text-base"
                          >
                            {banks.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className={small}>
                            {t("cheques.clear")}
                          </button>
                        </ActionForm>
                        <ActionForm action={moveChequeAction} className="inline">
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="action" value="bounce" />
                          <button type="submit" className={smallDanger}>
                            {t("cheques.bounce")}
                          </button>
                        </ActionForm>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </section>
    </div>
  );
}
