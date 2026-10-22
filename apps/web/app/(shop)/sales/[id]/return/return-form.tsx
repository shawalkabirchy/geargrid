"use client";

import { useState, useTransition } from "react";
import type { AccountOption } from "../../../../../src/server/services/trade-reads";
import { digitsText, quantityMilli, takaText, typedNumber, type Labels } from "../../../client-format";
import { previewReturnAction, saveReturnAction } from "../../../trade-actions";

// A customer return (GearGrid plan 2.6, 2.13): how many of each line come back and in what state, then the return's
// value (worked out by the server: the bill's discount and round-off are shared out) and how it is refunded: off the
// customer's due, as cash, or both. The API's own rules refuse anything else.

export type ReturnLine = { id: string; name: string; unit: string; left: number };

export function ReturnForm({
  saleId,
  lines,
  hasCustomer,
  cashAccounts,
  banglaDigits,
  labels,
}: {
  saleId: string;
  lines: ReturnLine[];
  hasCustomer: boolean;
  cashAccounts: AccountOption[];
  banglaDigits: boolean;
  labels: Labels;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, "yes" | "damaged">>({});
  const [preview, setPreview] = useState<{ total: number; customerDue: number | null } | null>(null);
  const [refundDue, setRefundDue] = useState("");
  const [refundCash, setRefundCash] = useState("");
  const [accountId, setAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const taka = (amount: number) => takaText(BigInt(amount), banglaDigits, labels.taka);

  const items = () =>
    lines
      .filter((line) => typedNumber(quantities[line.id] ?? "") > 0)
      .map((line) => ({
        sale_item_id: line.id,
        quantity: typedNumber(quantities[line.id] ?? ""),
        restock: restock[line.id] ?? "yes",
      }));

  function calculate() {
    setError("");
    if (items().length === 0) return setError(labels.nothing ?? "");
    if (
      lines.some((line) => (quantities[line.id] ?? "").trim() && quantityMilli(quantities[line.id]!) === null)
    ) {
      return setError(labels.nothing ?? "");
    }
    startTransition(async () => {
      const result = await previewReturnAction({ sale_id: saleId, items: items() });
      if (result.status === "error") {
        setPreview(null);
        return setError(result.message);
      }
      setPreview({ total: result.total, customerDue: result.customerDue });
      const offDue = hasCustomer ? Math.min(result.total, result.customerDue ?? 0) : 0;
      setRefundDue(String(offDue));
      setRefundCash(String(result.total - offDue));
    });
  }

  function save() {
    setError("");
    startTransition(async () => {
      const result = await saveReturnAction({
        sale_id: saleId,
        items: items(),
        refund_due_taka: Math.round(typedNumber(refundDue)),
        refund_cash_taka: Math.round(typedNumber(refundCash)),
        ...(accountId ? { account_id: accountId } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setError(result.message);
    });
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        {lines.map((line) => (
          <div
            key={line.id}
            className="grid gap-3 md:grid-cols-[1fr_9rem_14rem] md:items-end"
            data-testid="return-line"
          >
            <div>
              <div className="font-medium">{line.name}</div>
              <div className="text-sm text-stone-500">
                {labels.can_return?.replace("{{qty}}", `${digitsText(line.left, banglaDigits)} ${line.unit}`)}
              </div>
            </div>
            <label className="block">
              <span className="text-stone-700">{labels.qty}</span>
              <input
                value={quantities[line.id] ?? ""}
                onChange={(event) => {
                  setPreview(null);
                  setQuantities({ ...quantities, [line.id]: event.target.value });
                }}
                inputMode="decimal"
                className="field"
                aria-label={`${labels.qty} ${line.name}`}
              />
            </label>
            <label className="block">
              <span className="text-stone-700">{labels.restock}</span>
              <select
                value={restock[line.id] ?? "yes"}
                onChange={(event) => {
                  setPreview(null);
                  setRestock({ ...restock, [line.id]: event.target.value as "yes" | "damaged" });
                }}
                className="field"
              >
                <option value="yes">{labels.restock_yes}</option>
                <option value="damaged">{labels.restock_damaged}</option>
              </select>
            </label>
          </div>
        ))}
        <button type="button" disabled={pending} onClick={calculate} className="button-primary">
          {labels.calc}
        </button>
      </section>

      {preview && (
        <section className="card space-y-4">
          <p className="text-xl">
            {labels.total}: <strong data-testid="return-total">{taka(preview.total)}</strong>
          </p>
          {preview.customerDue !== null && (
            <p className="text-stone-600">
              {labels.customer_due?.replace("{{due}}", taka(preview.customerDue))}
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            {hasCustomer && (
              <label className="block">
                <span className="text-stone-700">{labels.refund_due}</span>
                <input
                  value={refundDue}
                  onChange={(event) => {
                    setRefundDue(event.target.value);
                    const off = typedNumber(event.target.value);
                    if (Number.isFinite(off)) setRefundCash(String(Math.max(0, preview.total - off)));
                  }}
                  inputMode="numeric"
                  className="field"
                />
              </label>
            )}
            <label className="block">
              <span className="text-stone-700">{labels.refund_cash}</span>
              <input
                value={refundCash}
                onChange={(event) => setRefundCash(event.target.value)}
                inputMode="numeric"
                className="field"
                readOnly={!hasCustomer}
              />
            </label>
            {cashAccounts.length > 1 && typedNumber(refundCash) > 0 && (
              <label className="block">
                <span className="text-stone-700">{labels.account}</span>
                <select
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className="field"
                >
                  <option value="">—</option>
                  {cashAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="text-sm text-stone-500">{labels.split_hint}</p>
          <label className="block max-w-xl">
            <span className="text-stone-700">{labels.reason}</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={200}
              className="field"
            />
          </label>
          <button type="button" disabled={pending} onClick={save} className="button-primary">
            {labels.save}
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className="text-lg text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
