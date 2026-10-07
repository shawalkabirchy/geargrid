import { describe, expect, it } from "vitest";
import bn from "./messages/bn.json";
import en from "./messages/en.json";
import { ERROR_STATUS, errorResponse, WARNING_CODES } from "./errors";

// Every code of spec 6.4 has its text in both languages (spec 6.3), and nothing unexpected leaks out.

describe("error and warning messages", () => {
  it("has English and Bangla text for every error and warning code, and no text without a code", () => {
    const codes = Object.keys(ERROR_STATUS).sort();
    expect(Object.keys(en.errors).sort()).toEqual(codes);
    expect(Object.keys(bn.errors).sort()).toEqual(codes);
    expect(Object.keys(en.warnings).sort()).toEqual([...WARNING_CODES].sort());
    expect(Object.keys(bn.warnings).sort()).toEqual([...WARNING_CODES].sort());
    for (const text of [...Object.values(bn.errors), ...Object.values(bn.warnings)])
      expect(text).toMatch(/[ঀ-৿]/);
  });

  it("answers anything unexpected as INTERNAL 500 with only the request ID", async () => {
    const response = errorResponse(new Error("secret detail"), "req-1");
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: Record<string, unknown> };
    expect(body.error).toMatchObject({ code: "INTERNAL", details: { request_id: "req-1" } });
    expect(JSON.stringify(body)).not.toContain("secret detail");
  });
});
