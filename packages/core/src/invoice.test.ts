import { describe, expect, it } from "vitest";
import { formatInvoiceNo, isInvoiceNo } from "./invoice";

describe("formatInvoiceNo", () => {
  it("writes the prefix and six digits", () => {
    expect(formatInvoiceNo("W", 1)).toBe("W-000001");
    expect(formatInvoiceNo("A", 42n)).toBe("A-000042");
    expect(formatInvoiceNo({ device: 3 }, 123)).toBe("M3-000123");
    expect(formatInvoiceNo("A", 1234567)).toBe("A-1234567");
  });

  it("refuses a sequence or device below 1", () => {
    expect(() => formatInvoiceNo("W", 0)).toThrow(RangeError);
    expect(() => formatInvoiceNo({ device: 0 }, 1)).toThrow(RangeError);
  });
});

describe("isInvoiceNo", () => {
  it("accepts the three forms and nothing else", () => {
    expect(isInvoiceNo("M1-000001")).toBe(true);
    expect(isInvoiceNo("W-000010")).toBe(true);
    expect(isInvoiceNo("A-1234567")).toBe(true);
    expect(isInvoiceNo("M0-000001")).toBe(false);
    expect(isInvoiceNo("X-000001")).toBe(false);
    expect(isInvoiceNo("W-12345")).toBe(false);
  });
});
