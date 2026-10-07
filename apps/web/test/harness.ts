import { apiKeys, createDb } from "@geargrid/db";
import { uuidv7 } from "@geargrid/core";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runChecks } from "../../../scripts/db-check";
import { seedDatabase } from "../../../supabase/seed/seed";
import { closeDatabase } from "../src/server/db";

// The API's database tests (spec 6.10): each file gets its own database, migrated and seeded, and the API connects to
// it as app_api, as on the laptop and in production. They create and drop databases, so they run only when
// GEARGRID_ENV=ci (CI's container, or the same on the laptop's Docker).

export const inCi = process.env.GEARGRID_ENV === "ci";
export const SEED_KEY = process.env.SEED_API_KEY ?? "";
const migrationUrl = process.env.MIGRATION_DATABASE_URL ?? "";
const migrationsFolder = fileURLToPath(new URL("../../../supabase/migrations", import.meta.url));

/** Extra keys for the scope tests: ggk_ plus 32 base62 characters. */
export const READ_ONLY_KEY = `ggk_${"readonly".padEnd(32, "0")}`;
export const NO_READ_KEY = `ggk_${"salesonly".padEnd(32, "0")}`;
export const REVOKED_KEY = `ggk_${"revoked".padEnd(32, "0")}`;

function urlFor(database: string, user?: { name: string; password: string }): string {
  const url = new URL(migrationUrl);
  url.pathname = `/${database}`;
  if (user) {
    url.username = user.name;
    url.password = user.password;
  }
  return url.toString();
}

async function onServer(statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

export interface TestShop {
  /** The database as its owner, for direct checks and for setting up cases. */
  admin: pg.Pool;
  drop(): Promise<void>;
}

/** A new database with the migrations and the seed; the API's pool is pointed at it as app_api. */
export async function createTestShop(name: string): Promise<TestShop> {
  const database = `gg_api_${name}_${Date.now()}`;
  await onServer(`create database "${database}"`);
  const { db, pool } = createDb(urlFor(database), 3);
  await migrate(db, { migrationsFolder });
  await seedDatabase(db, { apiKey: SEED_KEY, now: new Date() });
  const hash = (key: string) => createHash("sha256").update(key).digest("hex");
  await db.insert(apiKeys).values([
    {
      id: uuidv7(),
      name: "read only",
      keyPrefix: "ggk_read",
      keyHash: hash(READ_ONLY_KEY),
      scopes: ["read"],
    },
    {
      id: uuidv7(),
      name: "no read",
      keyPrefix: "ggk_sale",
      keyHash: hash(NO_READ_KEY),
      scopes: ["sales:write"],
    },
    {
      id: uuidv7(),
      name: "revoked",
      keyPrefix: "ggk_revo",
      keyHash: hash(REVOKED_KEY),
      scopes: ["read"],
      revokedAt: new Date(),
    },
  ]);
  await closeDatabase();
  process.env.DATABASE_URL = urlFor(database, {
    name: "app_api",
    password: process.env.APP_API_PASSWORD ?? "",
  });
  return {
    admin: pool,
    async drop() {
      await closeDatabase();
      await pool.end();
      await onServer(`drop database "${database}" with (force)`);
    },
  };
}

type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

/** Calls a route handler as Next would, with the seed's key unless told otherwise. */
export async function call(
  handler: RouteHandler,
  options: {
    method?: string;
    path?: string;
    params?: Record<string, string>;
    body?: unknown;
    key?: string | null;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const headers: Record<string, string> = { "content-type": "application/json", ...options.headers };
  const key = options.key === undefined ? SEED_KEY : options.key;
  if (key) headers["x-api-key"] = key;
  const request = new Request(`http://localhost:3200${options.path ?? "/api/v1/test"}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const response = await handler(request, { params: Promise.resolve(options.params ?? {}) });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
  };
}

/** The first row of a query on the test database. */
export async function first<T extends Record<string, unknown>>(
  shop: TestShop,
  sql: string,
  values: unknown[] = [],
): Promise<T> {
  return (await shop.admin.query<T>(sql, values)).rows[0]!;
}

export async function stockOfPart(shop: TestShop, partId: string): Promise<number> {
  return Number(
    (
      await first<{ quantity: string }>(shop, "select quantity from stock_levels where part_id = $1", [
        partId,
      ])
    ).quantity,
  );
}

export async function dueOfCustomer(shop: TestShop, customerId: string): Promise<number> {
  return Number(
    (
      await first<{ due_balance: string }>(shop, "select due_balance from customers where id = $1", [
        customerId,
      ])
    ).due_balance,
  );
}

export async function payableOfSupplier(shop: TestShop, supplierId: string): Promise<number> {
  return Number(
    (
      await first<{ payable_balance: string }>(shop, "select payable_balance from suppliers where id = $1", [
        supplierId,
      ])
    ).payable_balance,
  );
}

/** The db:check rules (spec 5.6) that fail on the test database: an empty list when all hold. */
export async function failedChecks(shop: TestShop) {
  const client = await shop.admin.connect();
  try {
    return (await runChecks(client)).filter((result) => result.rows.length > 0);
  } finally {
    client.release();
  }
}

/** Every table a write may touch, for the dry-run check (spec 6.10). */
export const BUSINESS_TABLES = [
  "sales",
  "sale_items",
  "sale_payments",
  "customer_payments",
  "customers",
  "customer_ledger",
  "suppliers",
  "supplier_ledger",
  "supplier_payments",
  "purchases",
  "purchase_items",
  "returns",
  "return_items",
  "parts",
  "fitments",
  "stock_levels",
  "stock_movements",
  "accounts",
  "account_transactions",
  "cheques",
  "invoice_counters",
  "idempotency_keys",
  "audit_logs",
  "change_log",
];

/** Every business table's row count and checksum: a dry run must leave all of them as they were. */
export async function fingerprintOf(shop: TestShop): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const table of BUSINESS_TABLES) {
    const row = await first<{ n: string; sum: string | null }>(
      shop,
      `select count(*) as n, md5(string_agg(t::text, ',' order by t::text)) as sum from ${table} t`,
    );
    out[table] = `${row.n}:${row.sum}`;
  }
  return out;
}
