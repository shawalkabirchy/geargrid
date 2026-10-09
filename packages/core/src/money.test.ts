import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { lineValue, parseTaka, roundHalfAwayFromZero, roundOff, tierPrice, toSafeNumber } from "./money";

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
  it("multiplies milli-quantities by the price and rounds to the taka (D92)", () => {
    expect(lineValue(2000n, 1600n)).toBe(3200n);
    expect(lineValue(1500n, 951n)).toBe(1427n); // 1426.5 taka rounds up
    expect(lineValue(333n, 1001n)).toBe(333n); // 333.333 taka
    expect(lineValue(500n, 1n)).toBe(1n); // half a taka rounds up
  });
});

describe("roundOff", () => {
  it("rounds whole taka to 5 or 10 taka and returns the signed adjustment; 1 taka changes nothing", () => {
    expect(roundOff(4501n, 1)).toEqual({ rounded: 4501n, adjustment: 0n });
    expect(roundOff(1233n, 5)).toEqual({ rounded: 1235n, adjustment: 2n });
    expect(roundOff(1232n, 5)).toEqual({ rounded: 1230n, adjustment: -2n });
    expect(roundOff(1605n, 10)).toEqual({ rounded: 1610n, adjustment: 5n });
    expect(roundOff(1600n, 10)).toEqual({ rounded: 1600n, adjustment: 0n });
  });
});

describe("tierPrice", () => {
  const part = { retailPrice: 1800n, garagePrice: 1600n };
  const noGarage = { retailPrice: 1800n, garagePrice: null };

  it("uses the tier's price, falling back to retail when it is empty", () => {
    expect(tierPrice(part, "retail")).toBe(1800n);
    expect(tierPrice(part, "garage")).toBe(1600n);
    expect(tierPrice(noGarage, "garage")).toBe(1800n);
  });
});

describe("parseTaka", () => {
  it("reads whole taka, with or without zero decimals", () => {
    expect(parseTaka("4500")).toBe(4500n);
    expect(parseTaka(" 4500.00 ")).toBe(4500n);
    expect(parseTaka("-12")).toBe(-12n);
  });

  it("refuses paisa and text (D92)", () => {
    expect(() => parseTaka("4500.50")).toThrow(AppError);
    expect(() => parseTaka("0.05")).toThrow(AppError);
    expect(() => parseTaka("12 taka")).toThrow(AppError);
  });
});

describe("toSafeNumber", () => {
  it("returns safe integers and refuses larger ones", () => {
    expect(toSafeNumber(4500n)).toBe(4500);
    expect(() => toSafeNumber(2n ** 60n)).toThrow(AppError);
  });
});
