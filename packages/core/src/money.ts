import { AppError } from "./errors";

// All money is bigint paisa (1 taka = 100 paisa); quantities are bigint milli-units (spec 5.1, 6.7).

export type PriceTier = "retail" | "garage" | "wholesale";
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

/** Value of a line: quantity in milli-units times the unit price, rounded to the paisa. */
export function lineValue(quantityMilli: bigint, unitPrice: bigint): bigint {
  return roundHalfAwayFromZero(quantityMilli * unitPrice, 1000n);
}

/** Rounds a total to 1, 5 or 10 taka; returns the rounded total and the signed adjustment. */
export function roundOff(paisa: bigint, step: RoundOffStep): { rounded: bigint; adjustment: bigint } {
  const unit = BigInt(step) * 100n;
  const rounded = roundHalfAwayFromZero(paisa, unit) * unit;
  return { rounded, adjustment: rounded - paisa };
}

/** The price for a tier; an empty garage or wholesale price falls back to retail. */
export function tierPrice(
  prices: { retailPrice: bigint; garagePrice: bigint | null; wholesalePrice: bigint | null },
  tier: PriceTier,
): bigint {
  if (tier === "garage") return prices.garagePrice ?? prices.retailPrice;
  if (tier === "wholesale") return prices.wholesalePrice ?? prices.retailPrice;
  return prices.retailPrice;
}

const TAKA_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/** "4500" or "4500.5" taka to paisa, exactly; more than two decimals is an error. */
export function takaToPaisa(taka: string): bigint {
  const match = TAKA_PATTERN.exec(taka.trim());
  if (!match) throw new AppError("INVALID_AMOUNT", 400, "errors.invalidAmount", { value: taka });
  const [, sign, whole, fraction = ""] = match;
  const paisa = BigInt(whole ?? "0") * 100n + BigInt(fraction.padEnd(2, "0"));
  return sign === "-" ? -paisa : paisa;
}

/** A bigint as a JSON number, only when it is a safe integer. */
export function toSafeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new AppError("NUMBER_TOO_LARGE", 500, "errors.numberTooLarge", { value: value.toString() });
  }
  return number;
}
