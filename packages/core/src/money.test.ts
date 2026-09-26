import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { lineValue, roundHalfAwayFromZero, roundOff, takaToPaisa, tierPrice, toSafeNumber } from "./money";

describe("roundHalfAwayFromZero", () => {
  it("rounds halves away from zero in both directions", () => {
    expect(roundHalfAwayFromZero(5n, 2n)).toBe(3n);
    expect(roundHalfAwayFromZero(-5n, 2n)).toBe(-3n);
    expect(roundHalfAwayFromZero(4n, 3n)).toBe(1n);
    expect(roundHalfAwayFromZero(5n, 3n)).toBe(2n);
    expect(roundHalfAwayFromZero(-4n, 3n)).toBe(-1n);
    expect(roundHalfAwayFromZero(0n, 7n)).toBe(0n);
  });

  it("refuses a divisor that is not positive", () => {
    expect(() => roundHalfAwayFromZero(1n, 0n)).toThrow(RangeError);
  });
});

describe("lineValue", () => {
  it("multiplies milli-quantities by the price and rounds to the paisa", () => {
    expect(lineValue(2000n, 160000n)).toBe(320000n);
    expect(lineValue(1500n, 95050n)).toBe(142575n);
    expect(lineValue(333n, 1001n)).toBe(333n); // 333.333 paisa
    expect(lineValue(500n, 1n)).toBe(1n); // 0.5 paisa rounds up
  });
});

describe("roundOff", () => {
  it("rounds to 1, 5 or 10 taka and returns the signed adjustment", () => {
    expect(roundOff(450050n, 1)).toEqual({ rounded: 450100n, adjustment: 50n });
    expect(roundOff(450049n, 1)).toEqual({ rounded: 450000n, adjustment: -49n });
    expect(roundOff(123250n, 5)).toEqual({ rounded: 123500n, adjustment: 250n });
    expect(roundOff(123249n, 5)).toEqual({ rounded: 123000n, adjustment: -249n });
    expect(roundOff(160000n, 10)).toEqual({ rounded: 160000n, adjustment: 0n });
  });
});

describe("tierPrice", () => {
  const part = { retailPrice: 180000n, garagePrice: 160000n, wholesalePrice: null };

  it("uses the tier's price, falling back to retail when it is empty", () => {
    expect(tierPrice(part, "retail")).toBe(180000n);
    expect(tierPrice(part, "garage")).toBe(160000n);
    expect(tierPrice(part, "wholesale")).toBe(180000n);
  });
});

describe("takaToPaisa", () => {
  it("parses taka exactly", () => {
    expect(takaToPaisa("4500")).toBe(450000n);
    expect(takaToPaisa("4500.5")).toBe(450050n);
    expect(takaToPaisa("0.05")).toBe(5n);
    expect(takaToPaisa("-12.30")).toBe(-1230n);
  });

  it("rejects more than two decimals or text", () => {
    expect(() => takaToPaisa("1.234")).toThrow(AppError);
    expect(() => takaToPaisa("12 taka")).toThrow(AppError);
  });
});

describe("toSafeNumber", () => {
  it("returns safe integers and refuses larger ones", () => {
    expect(toSafeNumber(450000n)).toBe(450000);
    expect(() => toSafeNumber(2n ** 60n)).toThrow(AppError);
  });
});
