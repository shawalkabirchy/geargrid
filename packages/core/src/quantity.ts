import { AppError } from "./errors";

// Quantities are numeric(12,3) in the database and bigint milli-units in code (1.5 -> 1500n).

const QUANTITY_PATTERN = /^(-?)(\d+)(?:\.(\d{1,3}))?$/;

/** "1.5" or a database value such as "3.000" to milli-units, exactly. */
export function parseQuantity(text: string): bigint {
  const match = QUANTITY_PATTERN.exec(text.trim());
  if (!match) throw new AppError("INVALID_QUANTITY", 400, "errors.invalidQuantity", { value: text });
  const [, sign, whole, fraction = ""] = match;
  const milli = BigInt(whole ?? "0") * 1000n + BigInt(fraction.padEnd(3, "0"));
  return sign === "-" ? -milli : milli;
}

/** Milli-units to the numeric(12,3) text form, such as "1.500". */
export function formatQuantity(milli: bigint): string {
  const sign = milli < 0n ? "-" : "";
  const absolute = milli < 0n ? -milli : milli;
  return `${sign}${absolute / 1000n}.${(absolute % 1000n).toString().padStart(3, "0")}`;
}
