import { describe, expect, it } from "vitest";
import { addDays, dhakaDate, dhakaDay, formatDate } from "./dates";

describe("the shop's day", () => {
  it("starts at midnight in Dhaka (18:00 UTC the day before)", () => {
    const { start, end } = dhakaDay(new Date("2026-10-22T05:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-21T18:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-22T18:00:00.000Z");
  });

  it("puts 23:30 UTC on the next Dhaka day", () => {
    expect(dhakaDay(new Date("2026-10-22T23:30:00Z")).start.toISOString()).toBe("2026-10-22T18:00:00.000Z");
    expect(dhakaDate(new Date("2026-10-22T23:30:00Z"))).toBe("2026-10-23");
  });

  it("writes dates as dd/mm/yyyy", () => {
    expect(formatDate("2026-10-05")).toBe("05/10/2026");
    expect(formatDate(new Date("2026-10-04T19:00:00Z"))).toBe("05/10/2026");
  });

  it("adds days across a month end", () => {
    expect(addDays("2026-10-29", 7)).toBe("2026-11-05");
  });
});
