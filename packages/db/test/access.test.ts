import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_READABLE_TABLES } from "../src/access";

// Slice A lockdown tests (spec 5.3, 5.7). They need the CI container, so they run only when GEARGRID_ENV=ci and
// never against a Supabase project. CI has already run bootstrap, migrate, roles and seed on the main database.

const inCi = process.env.GEARGRID_ENV === "ci";
const migrationUrl = process.env.MIGRATION_DATABASE_URL ?? "";
const migrationsFolder = fileURLToPath(new URL("../../../supabase/migrations", import.meta.url));

function urlFor(database: string, user?: { name: string; password: string }): string {
  const url = new URL(migrationUrl);
  url.pathname = `/${database}`;
  if (user) {
    url.username = user.name;
    url.password = user.password;
  }
  return url.toString();
}

async function publicTables(client: pg.ClientBase): Promise<string[]> {
  const { rows } = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  return rows.map((row) => row.tablename);
}

describe.skipIf(!inCi)("database access (slice A)", () => {
  const admin = new pg.Client({ connectionString: migrationUrl });
  let tables: string[] = [];

  beforeAll(async () => {
    await admin.connect();
    tables = await publicTables(admin);
  });

  afterAll(async () => {
    await admin.end();
  });

  it("applies every migration to an empty database", async () => {
    const database = `gg_empty_${Date.now()}`;
    await admin.query(`create database ${database}`);
    const pool = new pg.Pool({ connectionString: urlFor(database), max: 1 });
    try {
      await migrate(drizzle(pool), { migrationsFolder });
      const client = await pool.connect();
      try {
        expect(await publicTables(client)).toEqual(tables);
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
      await admin.query(`drop database ${database} with (force)`);
    }
  });

  it("has row-level security and app_api's grants on every public table", async () => {
    expect(tables.length).toBe(39);
    const { rows } = await admin.query<{ relname: string; relrowsecurity: boolean; granted: boolean }>(
      `select c.relname, c.relrowsecurity,
              has_table_privilege('app_api', c.oid, 'SELECT, INSERT, UPDATE') as granted
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(rows.filter((row) => !row.relrowsecurity || !row.granted)).toEqual([]);
  });

  it.each(["anon", "authenticated"])("lets %s read no rows from any table", async (role) => {
    for (const table of tables) {
      await admin.query(`set role ${role}`);
      try {
        const { rows } = await admin.query(`select * from "${table}" limit 1`);
        expect(rows, table).toEqual([]);
      } catch (error) {
        expect((error as { code?: string }).code, table).toBe("42501"); // permission denied
      } finally {
        await admin.query("reset role");
      }
    }
  });

  describe("dokaanbondhu_ro", () => {
    let readOnly: pg.Client;

    beforeAll(async () => {
      // built here, not while the tests are collected: a skipped run has no database address
      readOnly = new pg.Client({
        connectionString: urlFor(new URL(migrationUrl).pathname.slice(1) || "postgres", {
          name: "dokaanbondhu_ro",
          password: process.env.DOKAAN_RO_PASSWORD ?? "",
        }),
      });
      await readOnly.connect();
    });

    afterAll(async () => {
      await readOnly.end();
    });

    it("reads every granted table", async () => {
      for (const table of AI_READABLE_TABLES) {
        const { rows } = await readOnly.query(`select count(*)::int as n from "${table}"`);
        expect(rows[0]?.n, table).toBeGreaterThanOrEqual(0);
      }
    });

    it("cannot read the tables that are not granted", async () => {
      const hidden = tables.filter((table) => !(AI_READABLE_TABLES as readonly string[]).includes(table));
      expect(hidden).toContain("api_keys");
      for (const table of hidden) {
        await expect(readOnly.query(`select 1 from "${table}" limit 1`), table).rejects.toMatchObject({
          code: "42501",
        });
      }
    });

    it("cannot write: every transaction is read-only", async () => {
      const { rows } = await readOnly.query("show default_transaction_read_only");
      expect(rows[0]?.default_transaction_read_only).toBe("on");
      await expect(readOnly.query("update parts set notes = 'changed' where false")).rejects.toMatchObject({
        code: "25006",
      }); // read-only transaction
      await expect(
        readOnly.query("insert into brands (id, name) values (gen_random_uuid(), 'x')"),
      ).rejects.toMatchObject({ code: "25006" });
    });
  });
});
