import { describe, expect, it } from "vitest";
import { messages, translator } from "./index";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe("labels", () => {
  it("has the same keys in Bangla and English", () => {
    expect(keys(messages.en).sort()).toEqual(keys(messages.bn).sort());
  });

  it("translates with values and counts", () => {
    expect(translator("bn")("common.taka", { amount: "৪,৫০০" })).toBe("৪,৫০০ টাকা");
    expect(translator("en")("home.sales_count", { count: 1 })).toBe("1 bill");
    expect(translator("en")("home.sales_count", { count: 3 })).toBe("3 bills");
  });
});

describe("counts in labels", () => {
  it("are written in Bangla digits when the shop uses them", () => {
    expect(translator("bn", { banglaDigits: true })("home.sales_count", { count: 57 })).toBe("৫৭টি বিল");
    expect(translator("bn", { banglaDigits: false })("home.sales_count", { count: 57 })).toBe("57টি বিল");
    expect(translator("en", { banglaDigits: true })("home.sales_count", { count: 1 })).toBe("১ bill");
  });
});
