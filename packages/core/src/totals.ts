import { AppError } from "./errors";
import { lineValue, roundHalfAwayFromZero, roundOff, type RoundOffStep } from "./money";

// The calculations of spec 6.7, in BigInt whole taka (D92) and milli-units, shared by the API and the seed.

export interface Discount {
  kind: "amount" | "percent";
  /** "amount": whole taka; "percent": hundredths of a percent (12.5% -> 1250n). */
  value: bigint;
}

export interface SaleTotals {
  subtotal: bigint;
  discount: bigint;
  roundOff: bigint;
  total: bigint;
}

/** Subtotal of the lines, the discount (at most the subtotal, at most 100%), the round-off and the total. */
export function saleTotals(
  lines: { quantityMilli: bigint; unitPrice: bigint }[],
  discount: Discount | null,
  step: RoundOffStep,
): SaleTotals {
  const subtotal = lines.reduce((sum, line) => sum + lineValue(line.quantityMilli, line.unitPrice), 0n);
  let off = 0n;
  if (discount?.kind === "amount") off = discount.value;
  if (discount?.kind === "percent") {
    if (discount.value > 10000n) throw new AppError("DISCOUNT_TOO_HIGH", 422, "errors.DISCOUNT_TOO_HIGH");
    off = roundHalfAwayFromZero(subtotal * discount.value, 10000n);
  }
  if (off < 0n || off > subtotal) {
    throw new AppError("DISCOUNT_TOO_HIGH", 422, "errors.DISCOUNT_TOO_HIGH", {
      subtotal_taka: Number(subtotal),
    });
  }
  const { rounded, adjustment } = roundOff(subtotal - off, step);
  return { subtotal, discount: off, roundOff: adjustment, total: rounded };
}

/** The average cost after a purchase line, before the stock level changes; stock below zero counts as zero. */
export function newAverageCost(
  stockMilli: bigint,
  avgCost: bigint,
  quantityMilli: bigint,
  unitCost: bigint,
): bigint {
  const old = stockMilli > 0n ? stockMilli : 0n;
  if (old + quantityMilli === 0n) return unitCost;
  return roundHalfAwayFromZero(old * avgCost + quantityMilli * unitCost, old + quantityMilli);
}

/** A return's value: its lines share out the sale's discount and round-off (D27), so a whole bill refunds its total. */
export function returnTotal(
  lines: { quantityMilli: bigint; unitPrice: bigint }[],
  sale: { subtotal: bigint; total: bigint },
): bigint {
  const gross = lines.reduce((sum, line) => sum + lineValue(line.quantityMilli, line.unitPrice), 0n);
  return sale.subtotal === 0n ? 0n : roundHalfAwayFromZero(gross * sale.total, sale.subtotal);
}
