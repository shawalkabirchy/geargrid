import { createDb, type Db } from "@geargrid/db";

// The API's one pool, as app_api (spec 4.2, 6.1). Made on first use, so tests can point DATABASE_URL at their own
// database first; kept on globalThis so Next's hot reload does not open a pool per reload. On Vercel
// (DokaanBondhu spec D209) the database certificate comes as text in DATABASE_SSL_CA, and DATABASE_POOL_MAX keeps its
// several copies under the free pooler's connections.

type Database = ReturnType<typeof createDb>;
const holder = globalThis as { __gearGridApiDb?: Database };

export function database(): Db {
  if (!holder.__gearGridApiDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // a certificate pasted on one line keeps its line breaks as \n
    const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n").trim();
    const max = Number(process.env.DATABASE_POOL_MAX) || 10;
    holder.__gearGridApiDb = createDb(url, max, ca ? { ca: `${ca}\n` } : {});
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
