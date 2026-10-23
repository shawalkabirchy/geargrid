import { describe, expect, it } from "vitest";
import { MAX_BYTES } from "../src/server/services/excel-import";

// A request to a Vercel function carries at most 4.5 MB (DokaanBondhu spec D209): the Excel import's largest file,
// with its form around it, must fit, so the same file works on the laptop, on Render and on Vercel.

const VERCEL_REQUEST = 4_500_000; // 4.5 MB, read the strict way
const FORM_ROOM = 256 * 1024; // the form's other fields and the multipart boundaries

describe("the Excel import's size", () => {
  it("takes files up to 4 MB, which with the form fit Vercel's request", () => {
    expect(MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_BYTES + FORM_ROOM).toBeLessThanOrEqual(VERCEL_REQUEST);
  });
});
