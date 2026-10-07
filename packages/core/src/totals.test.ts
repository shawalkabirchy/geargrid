import { describe, expect, it } from "vitest";
import { newAverageCost, returnTotal, saleTotals } from "./totals";

// Spec 6.7: totals, the average cost after a purchase, and a return's share of discount and round-off (D27).

describe("sale totals", () => {
  const lines = [
    { quantityMilli: 2000n, unitPrice: 1800n }, // 2 sets at 1,800
    { quantityMilli: 1500n, unitPrice: 333n }, // 1.5 litres at 333: 499.5 -> 500
  ];

  it("adds the lines, takes an amount or a percent off, and rounds the total", () => {
    expect(saleTotals(lines, null, 1)).toEqual({ subtotal: 4100n, discount: 0n, roundOff: 0n, total: 4100n });
    expect(saleTotals(lines, { kind: "amount", value: 103n }, 5)).toEqual({
      subtotal: 4100n,
      discount: 103n,
      roundOff: -2n, // 3,997 -> 3,995
      total: 3995n,
    });
    // 12.5% of 4,100 = 512.5 -> 513
    expect(saleTotals(lines, { kind: "percent", value: 1250n }, 10)).toMatchObject({
      discount: 513n,
      total: 3590n,
    });
  });

  it("refuses a discount above the subtotal or above 100%", () => {
    expect(() => saleTotals(lines, { kind: "amount", value: 4101n }, 1)).toThrow("DISCOUNT_TOO_HIGH");
    expect(() => saleTotals(lines, { kind: "percent", value: 10001n }, 1)).toThrow("DISCOUNT_TOO_HIGH");
  });
});

describe("average cost and returns", () => {
  it("weights the old stock and the new line, counting stock below zero as zero", () => {
    expect(newAverageCost(3000n, 1000n, 1000n, 1400n)).toBe(1100n);
    expect(newAverageCost(-2000n, 1000n, 1000n, 1400n)).toBe(1400n);
    expect(newAverageCost(0n, 0n, 0n, 900n)).toBe(900n);
  });

  it("refunds a whole bill exactly, and a part of it with its share of the discount", () => {
    const sale = { subtotal: 4100n, total: 3995n };
    const all = [
      { quantityMilli: 2000n, unitPrice: 1800n },
      { quantityMilli: 1500n, unitPrice: 333n },
    ];
    expect(returnTotal(all, sale)).toBe(3995n);
    expect(returnTotal([{ quantityMilli: 1000n, unitPrice: 1800n }], sale)).toBe(1754n); // 1,800 * 3,995 / 4,100
    expect(returnTotal(all, { subtotal: 0n, total: 0n })).toBe(0n);
  });
});
