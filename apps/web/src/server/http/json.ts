import { toSafeNumber } from "@geargrid/core";

// JSON values of the answers (spec 6.3): money as whole-taka integers (D92), quantities as numbers with at most three
// decimals, times as ISO 8601.

export function taka(value: bigint): number {
  return toSafeNumber(value);
}

export function takaOrNull(value: bigint | null): number | null {
  return value === null ? null : toSafeNumber(value);
}

/** A numeric(12,3) value ("3.000") as a JSON number. */
export function quantityNumber(value: string): number {
  return Number(value);
}

export function iso(value: Date): string {
  return value.toISOString();
}
