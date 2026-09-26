import { createDb } from "@geargrid/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../supabase/seed/seed";
import { runChecks } from "./db-check";

// Seed and consistency tests (spec 5.7). They create and drop databases, so they run only when GEARGRID_ENV=ci.

const inCi = process.env.GEARGRID_ENV === "ci";
const migrationUrl = process.env.MIGRATION_DATABASE_URL ?? "";
const apiKey = process.env.SEED_API_KEY ?? "";
const migrationsFolder = fileURLToPath(new URL("../supabase/migrations", import.meta.url));

function urlFor(database: string): string {
  const url = new URL(migrationUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

/** Every row ID of every table with an id column, and the totals the examples depend on. */
async function fingerprint(client: pg.ClientBase) {
  const { rows: tables } = await client.query<{ table_name: string }>(
    `select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'id' and data_type = 'uuid' order by table_name`,
  );
  const ids: string[] = [];
  for (const { table_name } of tables) {
    const { rows } = await client.query<{ id: string }>(`select id from "${table_name}" order by id`);
    ids.push(...rows.map((row) => `${table_name}:${row.id}`));
  }
  const { rows: totals } = await client.query(
    `select (select sum(total) from sales) as sales, (select sum(due_balance) from customers) as dues,
            (select sum(payable_balance) from suppliers) as payables, (select sum(quantity) from stock_levels) as stock,
            (select sum(avg_cost) from parts) as avg_costs, (select count(*) from customer_ledger) as ledger_rows`,
  );
  return { ids, totals: totals[0] };
}

describe.skipIf(!inCi)("seed and db:check", () => {
  const admin = new pg.Client({ connectionString: migrationUrl });

  beforeAll(async () => {
    await admin.connect();
  });

  afterAll(async () => {
    await admin.end();
  });

  it("db:check passes on the seeded database", async () => {
    const failures = (await runChecks(admin)).filter((result) => result.rows.length > 0);
    expect(failures).toEqual([]);
  });

  it("gives identical IDs and totals on two fresh databases", async () => {
    const now = new Date();
    const prints = [];
    for (const name of ["a", "b"]) {
      const database = `gg_seed_${name}_${Date.now()}`;
      await admin.query(`create database ${database}`);
      const { db, pool } = createDb(urlFor(database), 1);
      try {
        await migrate(drizzle(pool), { migrationsFolder });
        await seedDatabase(db, { apiKey, now });
        const client = await pool.connect();
        try {
          const failures = (await runChecks(client)).filter((result) => result.rows.length > 0);
          expect(failures).toEqual([]);
          prints.push(await fingerprint(client));
        } finally {
          client.release();
        }
      } finally {
        await pool.end();
        await admin.query(`drop database ${database} with (force)`);
      }
    }
    expect(prints[0]?.ids.length).toBeGreaterThan(3000);
    expect(prints[1]).toEqual(prints[0]);
  });

  it("refuses to seed a database that already has data", async () => {
    const { db, pool } = createDb(migrationUrl, 1);
    try {
      await expect(seedDatabase(db, { apiKey, now: new Date() })).rejects.toThrow(/already seeded/);
    } finally {
      await pool.end();
    }
  });
});
