import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/** A pool and a Drizzle instance over it. The URL carries sslmode and sslrootcert (spec 4.2). */
export function createDb(connectionString: string, max = 3) {
  const pool = new pg.Pool({ connectionString, max });
  // An idle connection cut by the server (a restart, a dropped database) must not crash the process; the next query
  // gets a new connection.
  pool.on("error", (error) => console.error(`database connection closed: ${error.message}`));
  return { pool, db: drizzle(pool, { schema }) };
}

export type Db = ReturnType<typeof createDb>["db"];
