import { describe, expect, it } from "vitest";
import { formatTaka } from "./format";

describe("formatTaka", () => {
  it("groups the Bangladeshi way", () => {
    expect(formatTaka(0n)).toBe("0");
    expect(formatTaka(90000n)).toBe("900");
    expect(formatTaka(450000n)).toBe("4,500");
    expect(formatTaka(2190000n)).toBe("21,900");
    expect(formatTaka(12345600n)).toBe("1,23,456");
    expect(formatTaka(1234567800n)).toBe("1,23,45,678");
  });

  it("shows paisa only when they are not zero", () => {
    expect(formatTaka(450050n)).toBe("4,500.50");
    expect(formatTaka(5n)).toBe("0.05");
  });

  it("keeps the sign of negative amounts", () => {
    expect(formatTaka(-1230n)).toBe("-12.30");
  });

  it("writes Bangla digits on request", () => {
    expect(formatTaka(450000n, { banglaDigits: true })).toBe("৪,৫০০");
    expect(formatTaka(160050n, { banglaDigits: true })).toBe("১,৬০০.৫০");
  });
});
