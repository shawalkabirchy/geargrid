import { createDb, type Db } from "@geargrid/db";

// The API's one pool, as app_api (spec 4.2, 6.1). Made on first use, so tests can point DATABASE_URL at their own
// database first; kept on globalThis so Next's hot reload does not open a pool per reload.

type Database = ReturnType<typeof createDb>;
const holder = globalThis as { __gearGridApiDb?: Database };

export function database(): Db {
  if (!holder.__gearGridApiDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    holder.__gearGridApiDb = createDb(url, 10);
  }
  return holder.__gearGridApiDb.db;
}

/** Closes the pool (tests). */
export async function closeDatabase(): Promise<void> {
  const current = holder.__gearGridApiDb;
  delete holder.__gearGridApiDb;
  await current?.pool.end();
}

/** One transaction of the pipeline (spec 6.1). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
