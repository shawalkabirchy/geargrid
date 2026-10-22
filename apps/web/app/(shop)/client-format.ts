import { formatTaka } from "@geargrid/core";

// Formatting in the browser, the same way the server pages write it.

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

export type Labels = Record<string, string>;

/** "{{name}}" filled in, as the labels are written. */
export function fill(template: string | undefined, values: Record<string, string | number>): string {
  return (template ?? "").replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ""));
}

export function takaText(amount: bigint, banglaDigits: boolean, template: string | undefined): string {
  return fill(template, { amount: formatTaka(amount, { banglaDigits }) });
}

export function digitsText(value: string | number, banglaDigits: boolean): string {
  const text = String(value);
  return banglaDigits ? text.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)] ?? d) : text;
}

/** A typed number: Bangla digits become 0-9, commas and spaces go. NaN when it is not a number; 0 when empty. */
export function typedNumber(text: string): number {
  const plain = text.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d))).replace(/[,\s]/g, "");
  if (plain === "") return 0;
  return /^\d+(\.\d+)?$/.test(plain) ? Number(plain) : Number.NaN;
}

/** A quantity as milli-units, or null when it is not a positive number with at most three decimals. */
export function quantityMilli(text: string): bigint | null {
  const value = typedNumber(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  const milli = Math.round(value * 1000);
  return Math.abs(value * 1000 - milli) < 1e-6 ? BigInt(milli) : null;
}
