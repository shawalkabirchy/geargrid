import { describe, expect, it } from "vitest";
import { formatTaka } from "./format";

describe("formatTaka", () => {
  it("groups whole taka the Bangladeshi way", () => {
    expect(formatTaka(0n)).toBe("0");
    expect(formatTaka(900n)).toBe("900");
    expect(formatTaka(4500n)).toBe("4,500");
    expect(formatTaka(21900n)).toBe("21,900");
    expect(formatTaka(123456n)).toBe("1,23,456");
    expect(formatTaka(12345678n)).toBe("1,23,45,678");
  });

  it("keeps the sign of negative amounts", () => {
    expect(formatTaka(-1230n)).toBe("-1,230");
  });

  it("writes Bangla digits on request", () => {
    expect(formatTaka(4500n, { banglaDigits: true })).toBe("৪,৫০০");
    expect(formatTaka(160050n, { banglaDigits: true })).toBe("১,৬০,০৫০");
  });
});
