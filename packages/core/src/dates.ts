// The shop's day (Bangladesh, UTC+6 all year, no daylight saving) and its dd/mm/yyyy dates (GearGrid plan 8.4).

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The start and end (exclusive) of the Dhaka day holding `now`, as instants. */
export function dhakaDay(now: Date): { start: Date; end: Date } {
  const local = now.getTime() + DHAKA_OFFSET_MS;
  const start = local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - DHAKA_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}

/** The Dhaka calendar date of an instant as yyyy-mm-dd (a SQL date). */
export function dhakaDate(instant: Date): string {
  return new Date(instant.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/** A yyyy-mm-dd date, or an instant (taken in Dhaka), as dd/mm/yyyy. */
export function formatDate(value: string | Date): string {
  const iso = typeof value === "string" ? value : dhakaDate(value);
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** yyyy-mm-dd plus whole days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
