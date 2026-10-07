import { createHash } from "node:crypto";

// The SHA-256 of a request body in a canonical form (spec 6.3): object keys sorted at every level, so the same request
// sent with its keys in another order is still the same request.

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function canonicalHash(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(body ?? null)))
    .digest("hex");
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
