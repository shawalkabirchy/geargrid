// At most 10 wrong logins per address in 15 minutes (GearGrid plan 9, "Rate limits"); a right one clears the count.
// One server process, so memory is enough; Supabase Auth has its own limits behind this.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

/** True while the address still has tries left. */
export function mayTry(key: string, now = Date.now()): boolean {
  const entry = failures.get(key);
  return !entry || entry.resetAt <= now || entry.count < MAX_FAILURES;
}

export function failedTry(key: string, now = Date.now()): void {
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
  if (failures.size > 10_000) for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
}

export function goodTry(key: string): void {
  failures.delete(key);
}
