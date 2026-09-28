const BANGLA_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** Bangladeshi grouping: the last three digits, then groups of two (12,34,567). */
function groupDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${head},${digits.slice(-3)}`;
}

/** Whole taka as text: "4,500", "1,23,456", or with Bangla digits "৪,৫০০" (D92). */
export function formatTaka(taka: bigint, options: { banglaDigits?: boolean } = {}): string {
  const sign = taka < 0n ? "-" : "";
  const absolute = taka < 0n ? -taka : taka;
  const text = `${sign}${groupDigits(absolute.toString())}`;
  return options.banglaDigits ? text.replace(/\d/g, (digit) => BANGLA_DIGITS[Number(digit)] ?? digit) : text;
}
