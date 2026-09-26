// Invoice numbers (spec 5.1): M<n>- for sales made on device n, W- for the web dashboard, A- for the API,
// followed by at least six digits.

export type InvoiceSource = "W" | "A" | { device: number };

const INVOICE_PATTERN = /^(?:M[1-9]\d*|W|A)-\d{6,}$/;

export function formatInvoiceNo(source: InvoiceSource, sequence: bigint | number): string {
  if (BigInt(sequence) < 1n) throw new RangeError("invoice sequence starts at 1");
  if (typeof source === "object" && (!Number.isInteger(source.device) || source.device < 1)) {
    throw new RangeError("device number starts at 1");
  }
  const prefix = typeof source === "string" ? source : `M${source.device}`;
  return `${prefix}-${sequence.toString().padStart(6, "0")}`;
}

export function isInvoiceNo(text: string): boolean {
  return INVOICE_PATTERN.test(text);
}
