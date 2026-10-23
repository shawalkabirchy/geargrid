import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export interface DbOptions {
  /**
   * The database's CA certificate as text (PEM), for a host where the URL's sslrootcert file does not exist, such as
   * Vercel (DokaanBondhu spec D209). The server is then verified with it, as strictly as sslmode=verify-full.
   */
  ca?: string;
}

/**
 * The pool's settings. With a CA given, sslmode and sslrootcert leave the URL (pg would let them override the ssl
 * option) and the CA verifies the server; without one, the URL carries them as before (spec 4.2).
 */
export function poolConfig(connectionString: string, max: number, options: DbOptions = {}): pg.PoolConfig {
  if (!options.ca) return { connectionString, max };
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");
  return { connectionString: url.toString(), max, ssl: { ca: options.ca, rejectUnauthorized: true } };
}

/** A pool and a Drizzle instance over it. The URL carries sslmode and sslrootcert (spec 4.2), or options give the CA. */
export function createDb(connectionString: string, max = 3, options: DbOptions = {}) {
  const pool = new pg.Pool(poolConfig(connectionString, max, options));
  // An idle connection cut by the server (a restart, a dropped database) must not crash the process; the next query
  // gets a new connection.
  pool.on("error", (error) => console.error(`database connection closed: ${error.message}`));
  return { pool, db: drizzle(pool, { schema }) };
}

export type Db = ReturnType<typeof createDb>["db"];
