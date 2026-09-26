// A small seeded random generator, so every seed run produces the same rows (spec 5.5).

export type Random = ReturnType<typeof createRandom>;

/** mulberry32: 32-bit state, good enough for test data and identical on every platform. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRandom(seed: number) {
  const next = mulberry32(seed);
  const random = {
    next,
    /** An integer from min to max, both included. */
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(probability: number): boolean {
      return next() < probability;
    },
    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error("pick from an empty list");
      return item;
    },
    /** Picks by weight; items with weight 0 are never picked. */
    weighted<T>(items: readonly T[], weight: (item: T) => number): T {
      const total = items.reduce((sum, item) => sum + weight(item), 0);
      if (total <= 0) throw new Error("weighted pick without weight");
      let target = next() * total;
      for (const item of items) {
        target -= weight(item);
        if (target < 0) return item;
      }
      return random.pick(items);
    },
    /** Upper-case letters and digits, for transaction IDs. */
    code(length: number): string {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let text = "";
      for (let i = 0; i < length; i++) text += alphabet[Math.floor(next() * alphabet.length)];
      return text;
    },
  };
  return random;
}
