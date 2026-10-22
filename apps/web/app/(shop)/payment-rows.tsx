"use client";

import type { AccountOption } from "../../src/server/services/trade-reads";
import type { Labels } from "./client-format";

// How a sale or a purchase is paid: one or more rows of method and amount, the account (when the method has more than
// one), a TrxID for mobile money and the details of a cheque (GearGrid plan 2.4: split payment).

export const METHODS = ["cash", "bkash", "nagad", "rocket", "bank", "cheque"] as const;
export type Method = (typeof METHODS)[number];

export type PaymentRow = {
  method: Method;
  amount: string;
  accountId: string;
  trxId: string;
  chequeBank: string;
  chequeNo: string;
  chequeDue: string;
};

export const emptyPayment = (method: Method = "cash", amount = ""): PaymentRow => ({
  method,
  amount,
  accountId: "",
  trxId: "",
  chequeBank: "",
  chequeNo: "",
  chequeDue: "",
});

/** The rows as the API's PaymentInput; empty or zero amounts are left out. */
export function paymentsPayload(rows: PaymentRow[], amountOf: (text: string) => number) {
  return rows
    .filter((row) => amountOf(row.amount) > 0)
    .map((row) => ({
      method: row.method,
      amount_taka: amountOf(row.amount),
      ...(row.accountId ? { account_id: row.accountId } : {}),
      ...(row.trxId.trim() ? { trx_id: row.trxId.trim() } : {}),
      ...(row.method === "cheque"
        ? { cheque: { bank: row.chequeBank, cheque_no: row.chequeNo, due_date: row.chequeDue } }
        : {}),
    }));
}

export function PaymentRows({
  rows,
  onChange,
  accounts,
  labels,
  methodLabels,
  allowCheque,
}: {
  rows: PaymentRow[];
  onChange: (rows: PaymentRow[]) => void;
  accounts: AccountOption[];
  labels: Labels;
  methodLabels: Labels;
  allowCheque: boolean;
}) {
  const set = (index: number, change: Partial<PaymentRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const ofKind = accounts.filter((account) => account.kind === row.method);
        return (
          <div
            key={index}
            className="grid gap-2 md:grid-cols-[10rem_9rem_1fr_auto] md:items-end"
            data-testid="payment-row"
          >
            <label className="block">
              <span className="text-stone-700">{labels.method}</span>
              <select
                value={row.method}
                onChange={(event) => set(index, { method: event.target.value as Method, accountId: "" })}
                className="field"
              >
                {METHODS.filter((m) => allowCheque || m !== "cheque").map((m) => (
                  <option key={m} value={m}>
                    {methodLabels[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-stone-700">{labels.amount}</span>
              <input
                value={row.amount}
                onChange={(event) => set(index, { amount: event.target.value })}
                inputMode="numeric"
                className="field"
                aria-label={labels.amount}
              />
            </label>
            <div className="grid gap-2 md:grid-cols-2">
              {row.method !== "cheque" && ofKind.length > 1 && (
                <label className="block">
                  <span className="text-stone-700">{labels.account}</span>
                  <select
                    value={row.accountId}
                    onChange={(event) => set(index, { accountId: event.target.value })}
                    className="field"
                  >
                    <option value="">—</option>
                    {ofKind.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {["bkash", "nagad", "rocket", "bank"].includes(row.method) && (
                <label className="block">
                  <span className="text-stone-700">{labels.trx_id}</span>
                  <input
                    value={row.trxId}
                    onChange={(event) => set(index, { trxId: event.target.value })}
                    maxLength={64}
                    className="field"
                  />
                </label>
              )}
              {row.method === "cheque" && (
                <>
                  <label className="block">
                    <span className="text-stone-700">{labels.cheque_bank}</span>
                    <input
                      value={row.chequeBank}
                      onChange={(event) => set(index, { chequeBank: event.target.value })}
                      className="field"
                    />
                  </label>
                  <label className="block">
                    <span className="text-stone-700">{labels.cheque_no}</span>
                    <input
                      value={row.chequeNo}
                      onChange={(event) => set(index, { chequeNo: event.target.value })}
                      className="field"
                    />
                  </label>
                  <label className="block">
                    <span className="text-stone-700">{labels.cheque_due}</span>
                    <input
                      type="date"
                      value={row.chequeDue}
                      onChange={(event) => set(index, { chequeDue: event.target.value })}
                      className="field"
                    />
                  </label>
                </>
              )}
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                className="min-h-12 rounded-lg border border-stone-300 px-3"
                aria-label={labels.remove}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...rows, emptyPayment("bkash")])}
        className="rounded-lg border border-stone-300 px-3 py-1.5 hover:bg-stone-100"
      >
        + {labels.add_payment}
      </button>
    </div>
  );
}
