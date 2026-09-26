import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/** A pool and a Drizzle instance over it. The URL carries sslmode and sslrootcert (spec 4.2). */
export function createDb(connectionString: string, max = 3) {
  const pool = new pg.Pool({ connectionString, max });
  return { pool, db: drizzle(pool, { schema }) };
}

export type Db = ReturnType<typeof createDb>["db"];
