import { AppError } from "./errors";

// All money is bigint whole taka (spec 5.1, D92): every calculation rounds to the taka, half away from zero.
// Quantities are bigint milli-units (spec 6.7).

export type PriceTier = "retail" | "garage";
export type RoundOffStep = 1 | 5 | 10;

/** numerator / divisor, rounded half away from zero. The divisor must be positive. */
export function roundHalfAwayFromZero(numerator: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) throw new RangeError("divisor must be positive");
  const quotient = numerator / divisor; // BigInt division truncates toward zero
  const remainder = numerator % divisor;
  if (remainder * 2n >= divisor) return quotient + 1n;
  if (remainder * -2n >= divisor) return quotient - 1n;
  return quotient;
}

/** Value of a line: quantity in milli-units times the unit price, rounded to the taka. */
export function lineValue(quantityMilli: bigint, unitPrice: bigint): bigint {
  return roundHalfAwayFromZero(quantityMilli * unitPrice, 1000n);
}

/** Rounds a total to 1, 5 or 10 taka; returns the rounded total and the signed adjustment. */
export function roundOff(taka: bigint, step: RoundOffStep): { rounded: bigint; adjustment: bigint } {
  const unit = BigInt(step);
  const rounded = roundHalfAwayFromZero(taka, unit) * unit;
  return { rounded, adjustment: rounded - taka };
}

/** The price for a tier; an empty garage price falls back to retail. */
export function tierPrice(
  prices: { retailPrice: bigint; garagePrice: bigint | null },
  tier: PriceTier,
): bigint {
  if (tier === "garage") return prices.garagePrice ?? prices.retailPrice;
  return prices.retailPrice;
}

const TAKA_PATTERN = /^(-?)(\d+)(?:\.0{1,2})?$/;

/** "4500" (or "4500.00") taka as a bigint; an amount with paisa ("4500.50") is an error (D92). */
export function parseTaka(taka: string): bigint {
  const match = TAKA_PATTERN.exec(taka.trim());
  if (!match) throw new AppError("INVALID_AMOUNT", 400, "errors.invalidAmount", { value: taka });
  const [, sign, whole] = match;
  const value = BigInt(whole ?? "0");
  return sign === "-" ? -value : value;
}

/** A bigint as a JSON number, only when it is a safe integer. */
export function toSafeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new AppError("NUMBER_TOO_LARGE", 500, "errors.numberTooLarge", { value: value.toString() });
  }
  return number;
}
