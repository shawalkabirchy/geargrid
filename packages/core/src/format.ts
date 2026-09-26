const BANGLA_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** Bangladeshi grouping: the last three digits, then groups of two (12,34,567). */
function groupDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${head},${digits.slice(-3)}`;
}

/** Paisa as taka text: "4,500", "1,23,456.50", or with Bangla digits "৪,৫০০". Paisa show only when not zero. */
export function formatTaka(paisa: bigint, options: { banglaDigits?: boolean } = {}): string {
  const sign = paisa < 0n ? "-" : "";
  const absolute = paisa < 0n ? -paisa : paisa;
  const fraction = absolute % 100n;
  let text = `${sign}${groupDigits((absolute / 100n).toString())}`;
  if (fraction !== 0n) text += `.${fraction.toString().padStart(2, "0")}`;
  return options.banglaDigits ? text.replace(/\d/g, (digit) => BANGLA_DIGITS[Number(digit)] ?? digit) : text;
}
