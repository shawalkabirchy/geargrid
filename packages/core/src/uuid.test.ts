import { describe, expect, it } from "vitest";
import { uuidv5, uuidv7 } from "./uuid";

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("uuidv5", () => {
  it("matches the RFC 9562 reference value", async () => {
    expect(await uuidv5("www.example.com", DNS_NAMESPACE)).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("is stable for the same name and different for another", async () => {
    const a = await uuidv5("part:04465-12592", DNS_NAMESPACE);
    expect(await uuidv5("part:04465-12592", DNS_NAMESPACE)).toBe(a);
    expect(await uuidv5("part:04465-12593", DNS_NAMESPACE)).not.toBe(a);
  });

  it("refuses a namespace that is not a UUID", async () => {
    await expect(uuidv5("x", "not-a-uuid")).rejects.toThrow(TypeError);
  });
});

describe("uuidv7", () => {
  it("has version 7, the RFC variant and the time in its first 48 bits", () => {
    const now = 1_790_000_000_000;
    const id = uuidv7(now);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(parseInt(id.replace(/-/g, "").slice(0, 12), 16)).toBe(now);
  });

  it("sorts by time", () => {
    const earlier = uuidv7(1_790_000_000_000);
    const later = uuidv7(1_790_000_000_001);
    expect(earlier < later).toBe(true);
  });

  it("is random within the same millisecond", () => {
    expect(uuidv7(1_790_000_000_000)).not.toBe(uuidv7(1_790_000_000_000));
  });
});
