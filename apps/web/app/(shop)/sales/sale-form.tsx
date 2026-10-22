"use client";

import { lineValue, saleTotals, type RoundOffStep, type SaleTotals } from "@geargrid/core";
import { useMemo, useState, useTransition } from "react";
import type { AccountOption } from "../../../src/server/services/trade-reads";
import { digitsText, quantityMilli, takaText, typedNumber, type Labels } from "../client-format";
import { PartPicker } from "../part-picker";
import { emptyPayment, PaymentRows, paymentsPayload, type PaymentRow } from "../payment-rows";
import { saveSaleAction, type PartChoice } from "../trade-actions";

// The new-sale screen (GearGrid plan 8.1, 8.3): pick the customer (walk-in by default), add parts, change a price or
// a quantity, a discount in taka or percent, the round-off, and how it is paid; whatever is not paid is the
// customer's due. The totals are worked out here with the same code as the server (packages/core).

export type CustomerChoice = {
  id: string;
  name: string;
  price_tier: string;
  due_balance: string;
  phone: string | null;
};

type Line = { part: PartChoice; qty: string; price: string; listPrice: bigint };

const listPriceFor = (part: PartChoice, tier: string) =>
  BigInt(tier === "garage" && part.garage !== null ? part.garage : part.retail);

export function SaleForm({
  customers,
  accounts,
  roundOffRule,
  banglaDigits,
  labels,
  methodLabels,
}: {
  customers: CustomerChoice[];
  accounts: AccountOption[];
  roundOffRule: number;
  banglaDigits: boolean;
  labels: Labels;
  methodLabels: Labels;
}) {
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [discountKind, setDiscountKind] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([emptyPayment("cash")]);
  const [paidTouched, setPaidTouched] = useState(false);
  const [note, setNote] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const tier = customer?.price_tier ?? "retail";
  const taka = (amount: bigint) => takaText(amount, banglaDigits, labels.taka);

  const totals: SaleTotals | null = useMemo(() => {
    const priced = lines.map((line) => ({
      quantityMilli: quantityMilli(line.qty) ?? 0n,
      unitPrice: BigInt(Math.max(0, Math.round(typedNumber(line.price) || 0))),
    }));
    const value = typedNumber(discountValue);
    if (Number.isNaN(value)) return null;
    try {
      return saleTotals(
        priced,
        value > 0
          ? {
              kind: discountKind,
              value: BigInt(Math.round(discountKind === "percent" ? value * 100 : value)),
            }
          : null,
        roundOffRule as RoundOffStep,
      );
    } catch {
      return null; // a discount above the subtotal
    }
  }, [lines, discountKind, discountValue, roundOffRule]);

  // Until the owner types an amount, the first payment follows the total (a cash sale needs no typing).
  const shownPayments =
    !paidTouched && totals
      ? payments.map((row, i) => (i === 0 ? { ...row, amount: String(totals.total) } : row))
      : payments;
  const paid = shownPayments.reduce(
    (sum, row) => sum + BigInt(Math.max(0, Math.round(typedNumber(row.amount) || 0))),
    0n,
  );
  const due = totals ? totals.total - paid : 0n;

  function changeCustomer(id: string) {
    const next = customers.find((c) => c.id === id) ?? null;
    const nextTier = next?.price_tier ?? "retail";
    setCustomerId(id);
    // lines still at the old list price move to the new customer's price
    setLines((current) =>
      current.map((line) => {
        const listPrice = listPriceFor(line.part, nextTier);
        return typedNumber(line.price) === Number(line.listPrice)
          ? { ...line, price: String(listPrice), listPrice }
          : { ...line, listPrice };
      }),
    );
  }

  function addPart(part: PartChoice) {
    setLines((current) => {
      const at = current.findIndex((line) => line.part.id === part.id);
      if (at >= 0) {
        return current.map((line, i) =>
          i === at ? { ...line, qty: String(typedNumber(line.qty) + 1) } : line,
        );
      }
      const listPrice = listPriceFor(part, tier);
      return [...current, { part, qty: "1", price: String(listPrice), listPrice }];
    });
  }

  function payload() {
    return {
      customer_id: customerId || null,
      items: lines.map((line) => {
        const price = Math.round(typedNumber(line.price));
        return {
          part_id: line.part.id,
          quantity: typedNumber(line.qty),
          ...(BigInt(price) !== line.listPrice ? { unit_price_taka: price } : {}),
        };
      }),
      ...(typedNumber(discountValue) > 0
        ? { discount: { kind: discountKind, value: typedNumber(discountValue) } }
        : {}),
      payments: paymentsPayload(shownPayments, (text) => Math.round(typedNumber(text))),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
  }

  function save(confirmed: boolean) {
    setError("");
    if (lines.length === 0) return setError(labels.empty_cart ?? "");
    if (!customerId && due > 0n) return setError(labels.need_customer_for_due ?? "");
    startTransition(async () => {
      const result = await saveSaleAction(payload(), confirmed);
      if (result.status === "warnings") setWarnings(result.warnings);
      else {
        setWarnings([]);
        setError(result.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="card grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-stone-700">{labels.customer}</span>
          <select
            value={customerId}
            onChange={(event) => changeCustomer(event.target.value)}
            className="field"
            aria-label={labels.customer}
          >
            <option value="">{labels.walk_in}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </select>
          {customer && (
            <span className="mt-1 block text-sm text-stone-600">
              {labels[`tier_${customer.price_tier}`]} ·{" "}
              {labels.customer_due_now?.replace("{{due}}", taka(BigInt(customer.due_balance)))}
            </span>
          )}
        </label>
        <PartPicker labels={labels} banglaDigits={banglaDigits} onPick={addPart} />
      </section>

      <section className="card">
        {lines.length === 0 ? (
          <p className="text-stone-500">{labels.empty_cart}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" data-testid="cart">
              <thead>
                <tr className="text-sm text-stone-500">
                  <th className="px-2 py-2 font-medium">{labels.part}</th>
                  <th className="px-2 py-2 font-medium">{labels.qty}</th>
                  <th className="px-2 py-2 font-medium">{labels.price}</th>
                  <th className="px-2 py-2 text-right font-medium">{labels.line_total}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const milli = quantityMilli(line.qty);
                  const price = Math.round(typedNumber(line.price) || 0);
                  const lineTotal = milli === null ? null : lineValue(milli, BigInt(price));
                  const stockAfter = Number(line.part.stock) - typedNumber(line.qty);
                  return (
                    <tr key={line.part.id} className="border-t border-stone-100 align-top">
                      <td className="px-2 py-2">
                        <div className="font-medium">{line.part.name}</div>
                        <div className={`text-sm ${stockAfter < 0 ? "text-red-700" : "text-stone-500"}`}>
                          {line.part.number}
                          {line.part.rack ? ` · ${line.part.rack}` : ""} ·{" "}
                          {labels.in_stock?.replace(
                            "{{qty}}",
                            digitsText(Number(line.part.stock), banglaDigits),
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={line.qty}
                          onChange={(event) =>
                            setLines(
                              lines.map((l, i) => (i === index ? { ...l, qty: event.target.value } : l)),
                            )
                          }
                          inputMode="decimal"
                          className={`field w-24 ${milli === null ? "border-red-500" : ""}`}
                          aria-label={labels.qty}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={line.price}
                          onChange={(event) =>
                            setLines(
                              lines.map((l, i) => (i === index ? { ...l, price: event.target.value } : l)),
                            )
                          }
                          inputMode="numeric"
                          className="field w-32"
                          aria-label={labels.price}
                        />
                        {BigInt(price) !== line.listPrice && (
                          <div className="text-sm text-amber-700">
                            {labels.list_price?.replace("{{price}}", taka(line.listPrice))}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {lineTotal === null ? "—" : taka(lineTotal)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setLines(lines.filter((_, i) => i !== index))}
                          className="min-h-12 rounded-lg border border-stone-300 px-3"
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
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-stone-700">{labels.discount}</span>
              <input
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                inputMode="decimal"
                className="field w-32"
                aria-label={labels.discount}
              />
            </label>
            <select
              value={discountKind}
              onChange={(event) => setDiscountKind(event.target.value as "amount" | "percent")}
              className="field w-28"
              aria-label={labels.discount}
            >
              <option value="amount">{labels.discount_amount}</option>
              <option value="percent">{labels.discount_percent}</option>
            </select>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-lg" data-testid="totals">
            <dt>{labels.subtotal}</dt>
            <dd className="text-right tabular-nums">{totals ? taka(totals.subtotal) : "—"}</dd>
            <dt>{labels.discount}</dt>
            <dd className="text-right tabular-nums">{totals ? taka(totals.discount) : "—"}</dd>
            <dt>{labels.round_off}</dt>
            <dd className="text-right tabular-nums">{totals ? taka(totals.roundOff) : "—"}</dd>
            <dt className="text-xl font-bold">{labels.total}</dt>
            <dd className="text-right text-xl font-bold tabular-nums" data-testid="sale-total">
              {totals ? taka(totals.total) : "—"}
            </dd>
            <dt>{labels.paid}</dt>
            <dd className="text-right tabular-nums">{taka(paid)}</dd>
            <dt className={due > 0n ? "font-semibold text-amber-700" : ""}>{labels.due}</dt>
            <dd
              className={`text-right tabular-nums ${due > 0n ? "font-semibold text-amber-700" : ""}`}
              data-testid="sale-due"
            >
              {taka(due)}
            </dd>
          </dl>
        </section>
        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">{labels.payments}</h2>
          <PaymentRows
            rows={shownPayments}
            onChange={(rows) => {
              setPaidTouched(true);
              setPayments(rows);
            }}
            accounts={accounts}
            labels={labels}
            methodLabels={methodLabels}
            allowCheque={customerId !== ""}
          />
          <label className="block">
            <span className="text-stone-700">{labels.note}</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              className="field"
            />
          </label>
        </section>
      </div>

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
      <button
        type="button"
        disabled={pending || totals === null}
        onClick={() => save(false)}
        className="button-primary w-full text-xl md:w-auto"
      >
        {labels.save}
      </button>
    </div>
  );
}
