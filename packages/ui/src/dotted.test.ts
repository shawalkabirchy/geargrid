import { describe, expect, it } from "vitest";
import { translator } from "./index";

// The history page's labels are keyed by audit action names, which hold a dot ("sale.create").

describe("labels whose keys hold a dot", () => {
  it("are found under their section", () => {
    expect(translator("bn")("value.audit_action.sale.create", { defaultValue: "x" })).toBe("বিক্রি");
    expect(translator("en")("value.audit_action.cheque.bounce", { defaultValue: "x" })).toBe(
      "Cheque bounced",
    );
  });

  it("fall back to the action's own name when there is no label", () => {
    expect(translator("en")("value.audit_action.no.such", { defaultValue: "no.such" })).toBe("no.such");
  });
});
