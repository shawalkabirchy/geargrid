// At most 10 login tries per address in 15 minutes (GearGrid plan 9, "Rate limits"). One server process, so memory is
// enough; Supabase Auth has its own limits behind this.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES = 10;
const tries = new Map<string, { count: number; resetAt: number }>();

/** Counts one try; false when the address has used up its tries. */
export function allowTry(key: string, now = Date.now()): boolean {
  const entry = tries.get(key);
  if (!entry || entry.resetAt <= now) {
    tries.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (tries.size > 10_000) for (const [k, v] of tries) if (v.resetAt <= now) tries.delete(k);
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_TRIES;
}
