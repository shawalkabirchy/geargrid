import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { formatQuantity, parseQuantity } from "./quantity";

describe("parseQuantity", () => {
  it("reads whole and fractional quantities exactly", () => {
    expect(parseQuantity("3")).toBe(3000n);
    expect(parseQuantity("3.000")).toBe(3000n);
    expect(parseQuantity("1.5")).toBe(1500n);
    expect(parseQuantity("0.125")).toBe(125n);
    expect(parseQuantity("-2.25")).toBe(-2250n);
  });

  it("rejects more than three decimals", () => {
    expect(() => parseQuantity("1.2345")).toThrow(AppError);
  });
});

describe("formatQuantity", () => {
  it("writes the numeric(12,3) form", () => {
    expect(formatQuantity(3000n)).toBe("3.000");
    expect(formatQuantity(1500n)).toBe("1.500");
    expect(formatQuantity(-250n)).toBe("-0.250");
    expect(formatQuantity(0n)).toBe("0.000");
  });

  it("round-trips with parseQuantity", () => {
    for (const milli of [0n, 1n, 999n, 1000n, 123456n, -7500n]) {
      expect(parseQuantity(formatQuantity(milli))).toBe(milli);
    }
  });
});
