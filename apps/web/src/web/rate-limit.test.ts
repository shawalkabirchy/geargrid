import { describe, expect, it } from "vitest";
import { failedTry, goodTry, mayTry } from "./rate-limit";

describe("login tries", () => {
  it("stops an address after 10 wrong passwords for 15 minutes", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      expect(mayTry("a", now)).toBe(true);
      failedTry("a", now);
    }
    expect(mayTry("a", now)).toBe(false);
    expect(mayTry("a", now + 15 * 60 * 1000)).toBe(true);
  });

  it("never counts a right password, and a right one clears the wrong ones", () => {
    for (let i = 0; i < 9; i++) failedTry("b");
    goodTry("b");
    for (let i = 0; i < 9; i++) failedTry("b");
    expect(mayTry("b")).toBe(true);
  });
});
