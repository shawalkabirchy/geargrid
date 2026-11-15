"use client";

import { lineValue } from "@geargrid/core";
import { useEffect, useRef, useState, useTransition } from "react";
import type { AccountOption } from "../../../src/server/services/trade-reads";
import { quantityMilli, takaText, typedNumber, type Labels } from "../client-format";
import { PartPicker } from "../part-picker";
import { emptyPayment, PaymentRows, paymentsPayload, type PaymentRow } from "../payment-rows";
import { savePurchaseAction, type PartChoice } from "../trade-actions";
import { PhoneSaveBar } from "../ui";

// A purchase, the stock-in (GearGrid plan 2.7): the supplier, its bill number, the parts with quantity and cost, and
// what was paid now; the rest is owed to the supplier. Each line moves the part's average cost (spec 6.7). On a phone
// each line is a card and Save sits in a bar at the bottom with the total (D243).

type Line = { part: PartChoice; qty: string; cost: string };

export function PurchaseForm({
  suppliers,
  accounts,
  banglaDigits,
  labels,
  methodLabels,
}: {
  suppliers: { id: string; name: string }[];
  accounts: AccountOption[];
  banglaDigits: boolean;
  labels: Labels;
  methodLabels: Labels;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([emptyPayment("cash")]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const alerts = useRef<HTMLDivElement>(null);
  const taka = (amount: bigint) => takaText(amount, banglaDigits, labels.taka);

  // On a phone Save is in the bar at the bottom: bring the warnings into view (D243).
  useEffect(() => {
    if ((warnings.length > 0 || error) && window.matchMedia("(max-width: 1023px)").matches) {
      alerts.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [warnings, error]);

  const lineTotal = (line: Line) => {
    const milli = quantityMilli(line.qty);
    const cost = typedNumber(line.cost);
    return milli === null || !Number.isFinite(cost) ? null : lineValue(milli, BigInt(Math.round(cost)));
  };
  const total = lines.reduce((sum, line) => sum + (lineTotal(line) ?? 0n), 0n);
  const paid = payments.reduce(
    (sum, row) => sum + BigInt(Math.max(0, Math.round(typedNumber(row.amount) || 0))),
    0n,
  );

  function save(confirmed: boolean) {
    setError("");
    if (lines.length === 0) return setError(labels.empty_cart ?? "");
    startTransition(async () => {
      const result = await savePurchaseAction(
        {
          supplier_id: supplierId,
          ...(billNo.trim() ? { bill_no: billNo.trim() } : {}),
          items: lines.map((line) => ({
            part_id: line.part.id,
            quantity: typedNumber(line.qty),
            unit_cost_taka: Math.round(typedNumber(line.cost)),
          })),
          payments: paymentsPayload(payments, (text) => Math.round(typedNumber(text))),
        },
        confirmed,
      );
      if (result.status === "warnings") setWarnings(result.warnings);
      else {
        setWarnings([]);
        setError(result.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="card grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="text-stone-700">{labels.supplier}</span>
          <select
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            className="field"
            aria-label={labels.supplier}
          >
            <option value="" disabled>
              {labels.pick_supplier}
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-stone-700">{labels.bill_no}</span>
          <input
            value={billNo}
            onChange={(event) => setBillNo(event.target.value)}
            maxLength={64}
            className="field"
          />
        </label>
        <PartPicker
          labels={labels}
          banglaDigits={banglaDigits}
          onPick={(part) =>
            setLines((current) =>
              current.some((line) => line.part.id === part.id)
                ? current
                : [...current, { part, qty: "1", cost: "" }],
            )
          }
        />
      </section>

      <section
        className={`card ${lines.length > 0 ? "max-md:border-0 max-md:bg-transparent max-md:p-0" : ""}`}
      >
        {lines.length === 0 ? (
          <p className="text-stone-500">{labels.empty_cart}</p>
        ) : (
          <table className="w-full text-left max-md:block" data-testid="purchase-lines">
            <thead className="max-md:hidden">
              <tr className="text-sm text-stone-500">
                <th className="px-2 py-2 font-medium">{labels.part}</th>
                <th className="px-2 py-2 font-medium">{labels.qty}</th>
                <th className="px-2 py-2 font-medium">{labels.unit_cost}</th>
                <th className="px-2 py-2 text-right font-medium">{labels.line_total}</th>
                <th />
              </tr>
            </thead>
            <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
              {lines.map((line, index) => {
                const value = lineTotal(line);
                return (
                  <tr
                    key={line.part.id}
                    className="border-t border-stone-100 max-md:grid max-md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] max-md:items-end max-md:gap-x-2.5 max-md:gap-y-2 max-md:rounded-2xl max-md:border max-md:border-stone-200 max-md:bg-white max-md:p-3.5"
                  >
                    <td className="px-2 py-2 max-md:col-span-2 max-md:row-start-1 max-md:self-start max-md:p-0">
                      <div className="font-medium">{line.part.name}</div>
                      <div className="text-sm text-stone-500">{line.part.number}</div>
                    </td>
                    <td className="px-2 py-2 max-md:col-start-1 max-md:row-start-2 max-md:p-0">
                      <span className="block text-sm text-stone-600 md:hidden">{labels.qty}</span>
                      <input
                        value={line.qty}
                        onChange={(event) =>
                          setLines(lines.map((l, i) => (i === index ? { ...l, qty: event.target.value } : l)))
                        }
                        inputMode="decimal"
                        className="field w-24 max-md:w-full"
                        aria-label={labels.qty}
                      />
                    </td>
                    <td className="px-2 py-2 max-md:col-start-2 max-md:row-start-2 max-md:p-0">
                      <span className="block text-sm text-stone-600 md:hidden">{labels.unit_cost}</span>
                      <input
                        value={line.cost}
                        onChange={(event) =>
                          setLines(
                            lines.map((l, i) => (i === index ? { ...l, cost: event.target.value } : l)),
                          )
                        }
                        inputMode="numeric"
                        className="field w-32 max-md:w-full"
                        aria-label={labels.unit_cost}
                      />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums max-md:col-start-3 max-md:row-start-2 max-md:p-0 max-md:text-lg max-md:leading-[3rem] max-md:font-semibold">
                      {value === null ? "—" : taka(value)}
                    </td>
                    <td className="px-2 py-2 text-right max-md:col-start-3 max-md:row-start-1 max-md:self-start max-md:p-0">
                      <button
                        type="button"
                        onClick={() => setLines(lines.filter((_, i) => i !== index))}
                        className="min-h-12 rounded-lg border border-stone-300 px-3 max-md:min-h-11 max-md:min-w-11"
                        aria-label={labels.remove}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">{labels.payments}</h2>
          <PaymentRows
            rows={payments}
            onChange={setPayments}
            accounts={accounts}
            labels={labels}
            methodLabels={methodLabels}
            allowCheque
          />
        </section>
        <section className="card">
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-lg">
            <dt className="text-xl font-bold">{labels.total}</dt>
            <dd className="text-right text-xl font-bold tabular-nums" data-testid="purchase-total">
              {taka(total)}
            </dd>
            <dt>{labels.paid}</dt>
            <dd className="text-right tabular-nums">{taka(paid)}</dd>
            <dt className="font-semibold">{labels.due}</dt>
            <dd className="text-right font-semibold tabular-nums">{taka(total - paid)}</dd>
          </dl>
        </section>
      </div>

      <div ref={alerts} className="space-y-6 empty:hidden">
        {warnings.length > 0 && (
          <section role="alert" className="card border-2 border-amber-400 bg-amber-50">
            <p className="mb-2 font-semibold">{labels.warnings}</p>
            <ul className="mb-3 list-disc pl-6">
              {warnings.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <button type="button" disabled={pending} onClick={() => save(true)} className="button-primary">
              {labels.save_anyway}
            </button>
          </section>
        )}
        {error && (
          <p role="alert" className="text-lg text-red-700">
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => save(false)}
        className="button-main w-full text-xl max-lg:hidden md:w-auto"
      >
        {labels.save}
      </button>
      <PhoneSaveBar
        label={labels.total}
        total={taka(total)}
        detail={
          <>
            <span className="text-paid">
              {labels.paid} {taka(paid)}
            </span>
            <span aria-hidden="true"> · </span>
            <span className={total - paid > 0n ? "font-semibold text-red-700" : "text-stone-600"}>
              {labels.due} {taka(total - paid)}
            </span>
          </>
        }
        save={labels.save}
        onSave={() => save(false)}
        disabled={pending}
      />
    </div>
  );
}
