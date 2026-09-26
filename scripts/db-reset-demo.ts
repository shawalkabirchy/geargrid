import { createDb } from "@geargrid/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { API_KEY_PATTERN, seedInto } from "../supabase/seed/seed";
import { isMain, log, readEnv, runMain } from "./lib/cli";

// npm run db:reset-demo (spec 5.5): empties every public table (the system tables included, with RESTART IDENTITY,
// so invoice counters, keys, logs and ledger numbers start again) and reseeds, in one transaction. A reset
// database equals a fresh seed. Refuses to run unless GEARGRID_ENV is ci or dev.

if (isMain(import.meta.url)) {
  runMain(async () => {
    const env = readEnv({
      MIGRATION_DATABASE_URL: z.string().min(1),
      SEED_API_KEY: z.string().regex(API_KEY_PATTERN, "must be ggk_ plus 32 base62 characters"),
      GEARGRID_ENV: z.enum(["ci", "dev", "prod"]),
    });
    if (env.GEARGRID_ENV === "prod") {
      throw new Error("db:reset-demo refuses to run when GEARGRID_ENV is prod");
    }
    const { db, pool } = createDb(env.MIGRATION_DATABASE_URL, 1);
    try {
      const summary = await db.transaction(async (tx) => {
        const tables = await tx.execute<{ tablename: string }>(
          sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
        );
        const list = tables.rows.map((row) => `"${row.tablename}"`).join(", ");
        await tx.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
        return seedInto(tx, { apiKey: env.SEED_API_KEY, now: new Date() });
      });
      log(
        `Reset and reseeded: ${Object.entries(summary)
          .map(([table, count]) => `${table} ${count}`)
          .join(", ")}`,
      );
    } finally {
      await pool.end();
    }
  });
}
