import type { Ledger } from "../../src/server/services/party-reads";
import type { PageContext } from "../../src/web/page-context";
import { cell, money, Table } from "./ui";

// A customer's or supplier's ledger, newest first, with the running balance (GearGrid plan 2.5, 2.7). What is owed going
// up is brick red, going down green, the same for both (D207).

export function LedgerTable({
  ledger,
  page,
  labels,
}: {
  ledger: Ledger;
  page: Pick<PageContext, "t" | "taka" | "date">;
  labels: { debit: string; credit: string; balance: string; empty: string };
}) {
  const { t, taka, date } = page;
  if (ledger.lines.length === 0) return <p className="text-stone-600">{labels.empty}</p>;
  return (
    <>
      <Table
        right={[3, 4, 5]}
        head={[
          t("part.date"),
          t("customers.entry"),
          t("part.bill"),
          labels.debit,
          labels.credit,
          labels.balance,
        ]}
      >
        {ledger.lines.map((line) => (
          <tr key={line.id}>
            <td className={cell}>{date(line.created_at)}</td>
            <td className={cell}>{t(`value.ledger.${line.entry_type}`)}</td>
            <td className={cell}>{line.reference ?? t("form.none")}</td>
            <td className={`${money} text-red-700`}>{line.debit === "0" ? "" : taka(BigInt(line.debit))}</td>
            <td className={`${money} text-paid`}>{line.credit === "0" ? "" : taka(BigInt(line.credit))}</td>
            <td className={`${money} font-semibold`}>{taka(BigInt(line.balance_after))}</td>
          </tr>
        ))}
      </Table>
      {ledger.more && <p className="mt-2 text-sm text-stone-500">{t("customers.more")}</p>}
    </>
  );
}
