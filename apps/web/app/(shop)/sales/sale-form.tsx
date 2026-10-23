"use client";

import { lineValue, saleTotals, type RoundOffStep, type SaleTotals } from "@geargrid/core";
import { Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { AccountOption } from "../../../src/server/services/trade-reads";
import { digitsText, quantityMilli, takaText, typedNumber, type Labels } from "../client-format";
import { PartPicker } from "../part-picker";
import { emptyPayment, PaymentRows, paymentsPayload, type PaymentRow } from "../payment-rows";
import { saveSaleAction, type PartChoice } from "../trade-actions";
import { Badge } from "../ui";

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

  // Two columns from 1024 px (D207): who and what on the left, the bill and its payment on the right, ending in the
  // page's one marigold button.
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(21rem,1fr)]">
      <div className="min-w-0 space-y-6">
        <section className="card space-y-5">
          <label className="block">
            <span className="font-medium text-stone-700">{labels.customer}</span>
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
          </label>
          {customer && (
            <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge tone="brand">{labels[`tier_${customer.price_tier}`]}</Badge>
              <span
                className={
                  BigInt(customer.due_balance) > 0n ? "font-semibold text-red-700" : "text-stone-600"
                }
              >
                {labels.customer_due_now?.replace("{{due}}", taka(BigInt(customer.due_balance)))}
              </span>
            </div>
          )}
          <PartPicker labels={labels} banglaDigits={banglaDigits} onPick={addPart} />
        </section>

        <section className="card">
          {lines.length === 0 ? (
            <p className="text-stone-600">{labels.empty_cart}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left" data-testid="cart">
                <thead>
                  <tr className="border-b-[1.5px] border-stone-200 text-sm text-stone-600">
                    <th className="min-w-48 px-2 py-2.5 font-medium">{labels.part}</th>
                    <th className="px-2 py-2.5 font-medium">{labels.qty}</th>
                    <th className="px-2 py-2.5 font-medium">{labels.price}</th>
                    <th className="px-2 py-2.5 text-right font-medium">{labels.line_total}</th>
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
                      <tr key={line.part.id} className="border-t border-stone-200 align-top">
                        <td className="px-2 py-3">
                          <div className="font-semibold">{line.part.name}</div>
                          <div
                            className={`flex flex-wrap gap-x-3 text-sm ${stockAfter < 0 ? "text-red-700" : "text-stone-600"}`}
                          >
                            <span>{line.part.number}</span>
                            {line.part.rack && <span>{line.part.rack}</span>}
                            <span>
                              {labels.in_stock?.replace(
                                "{{qty}}",
                                digitsText(Number(line.part.stock), banglaDigits),
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          <input
                            value={line.qty}
                            onChange={(event) =>
                              setLines(
                                lines.map((l, i) => (i === index ? { ...l, qty: event.target.value } : l)),
                              )
                            }
                            inputMode="decimal"
                            className={`field mt-0 w-24 ${milli === null ? "border-red-500" : ""}`}
                            aria-label={labels.qty}
                          />
                        </td>
                        <td className="px-2 py-3">
                          <input
                            value={line.price}
                            onChange={(event) =>
                              setLines(
                                lines.map((l, i) => (i === index ? { ...l, price: event.target.value } : l)),
                              )
                            }
                            inputMode="numeric"
                            className="field mt-0 w-32"
                            aria-label={labels.price}
                          />
                          {BigInt(price) !== line.listPrice && (
                            <div className="mt-1 text-sm text-amber-700">
                              {labels.list_price?.replace("{{price}}", taka(line.listPrice))}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-3 pt-5 text-right font-semibold whitespace-nowrap tabular-nums">
                          {lineTotal === null ? "—" : taka(lineTotal)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setLines(lines.filter((_, i) => i !== index))}
                            className="inline-flex size-12 items-center justify-center rounded-xl text-stone-600 hover:bg-red-50 hover:text-red-700"
                            aria-label={labels.remove}
                          >
                            <Trash2 className="size-5" aria-hidden="true" />
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
      </div>

      <aside className="card space-y-5 lg:sticky lg:top-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="font-medium text-stone-700">{labels.discount}</span>
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
        <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-lg" data-testid="totals">
          <dt className="text-stone-700">{labels.subtotal}</dt>
          <dd className="text-right tabular-nums">{totals ? taka(totals.subtotal) : "—"}</dd>
          <dt className="text-stone-700">{labels.discount}</dt>
          <dd className="text-right tabular-nums">{totals ? taka(totals.discount) : "—"}</dd>
          <dt className="text-stone-700">{labels.round_off}</dt>
          <dd className="text-right tabular-nums">{totals ? taka(totals.roundOff) : "—"}</dd>
          <dt className="mt-1 border-t-[1.5px] border-stone-900 pt-3 text-xl font-bold">{labels.total}</dt>
          <dd
            className="figure mt-1 border-t-[1.5px] border-stone-900 pt-2 text-right text-3xl font-bold"
            data-testid="sale-total"
          >
            {totals ? taka(totals.total) : "—"}
          </dd>
        </dl>

        <div className="space-y-4 border-t border-stone-200 pt-4">
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
            <span className="font-medium text-stone-700">{labels.note}</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              className="field"
            />
          </label>
        </div>

        <dl className="grid grid-cols-[1fr_auto] items-baseline gap-y-2 border-t border-stone-200 pt-4 text-lg">
          <dt className="text-stone-700">{labels.paid}</dt>
          <dd className="text-right font-semibold text-paid tabular-nums">{taka(paid)}</dd>
          <dt className={due > 0n ? "font-semibold text-red-700" : "text-stone-700"}>{labels.due}</dt>
          <dd
            className={`text-right tabular-nums ${due > 0n ? "figure text-2xl font-bold text-red-700" : ""}`}
            data-testid="sale-due"
          >
            {taka(due)}
          </dd>
        </dl>

        {warnings.length > 0 && (
          <section role="alert" className="rounded-xl border-[1.5px] border-amber-400 bg-amber-50 p-4">
            <p className="mb-2 font-semibold text-amber-900">{labels.warnings}</p>
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
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-lg text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={pending || totals === null}
          onClick={() => save(false)}
          className="button-main w-full text-xl"
        >
          {labels.save}
        </button>
      </aside>
    </div>
  );
}
