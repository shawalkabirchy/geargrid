import { auditLogs, idempotencyKeys } from "@geargrid/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { GET as getCustomer } from "../app/api/v1/customers/[id]/route";
import { GET as getFitment } from "../app/api/v1/fitments/[id]/route";
import { GET as getPart } from "../app/api/v1/parts/[id]/route";
import { GET as getSupplier } from "../app/api/v1/suppliers/[id]/route";
import { database } from "../src/server/db";
import { apiError } from "../src/server/http/errors";
import { endpoint } from "../src/server/http/pipeline";
import {
  call,
  createTestShop,
  inCi,
  NO_READ_KEY,
  READ_ONLY_KEY,
  REVOKED_KEY,
  type TestShop,
} from "./harness";

// The request pipeline (spec 6.1-6.4) on a seeded database: keys and scopes, errors in both languages, read-back by ID,
// and, through a test endpoint that writes one audit row, idempotency and dry runs.

/** A POST that writes one audit row, so the tests can count what a request left behind. */
let fail = false;
const testWrite = endpoint(
  {
    method: "POST",
    route: "/api/v1/test-writes",
    scope: "read",
    body: z.object({ n: z.number().int(), note: z.string().optional() }),
    dryRun: true,
  },
  async ({ tx, actor, body, dryRun }) => {
    await tx.insert(auditLogs).values({
      source: actor.source,
      actingUser: actor.actingUser,
      action: "test.write",
      entity: "test",
      after: { n: body.n },
    });
    if (fail) throw apiError("PAYMENTS_EXCEED_TOTAL");
    return { status: 201, body: { n: body.n, dry_run: dryRun } };
  },
);

describe.skipIf(!inCi)("API pipeline", () => {
  let shop: TestShop;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    shop = await createTestShop("pipeline");
    const one = async (sql: string) => (await shop.admin.query<{ id: string }>(sql)).rows[0]!.id;
    ids.customer = await one("select id from customers where due_balance > 0 order by name limit 1");
    ids.supplier = await one("select id from suppliers order by name limit 1");
    ids.part = await one("select id from parts order by name_en limit 1");
    ids.fitment = await one("select id from fitments order by id limit 1");
    ids.deletedCustomer = await one("select id from customers order by name desc limit 1");
    await shop.admin.query("update customers set deleted_at = now() where id = $1", [ids.deletedCustomer]);
  }, 180_000);

  afterAll(async () => shop?.drop());

  const auditCount = async () =>
    Number(
      (await shop.admin.query("select count(*) from audit_logs where action = 'test.write'")).rows[0].count,
    );

  it("reads back a customer, supplier, part and fitment by ID, with money in whole taka", async () => {
    const customer = await call(getCustomer, { params: { id: ids.customer! } });
    expect(customer.status).toBe(200);
    expect(customer.body.customer).toMatchObject({ id: ids.customer, due_balance_taka: expect.any(Number) });
    expect(Number.isInteger((customer.body.customer as { due_balance_taka: number }).due_balance_taka)).toBe(
      true,
    );
    expect((await call(getSupplier, { params: { id: ids.supplier! } })).body.supplier).toMatchObject({
      id: ids.supplier,
      payable_balance_taka: expect.any(Number),
    });
    expect((await call(getPart, { params: { id: ids.part! } })).body.part).toMatchObject({
      id: ids.part,
      retail_price_taka: expect.any(Number),
      stock_quantity: expect.any(Number),
    });
    expect((await call(getFitment, { params: { id: ids.fitment! } })).body.fitment).toMatchObject({
      id: ids.fitment,
      deleted: false,
    });
  });

  it("answers 404 for an unknown or soft-deleted row and 400 for a bad ID, in both languages", async () => {
    const deleted = await call(getCustomer, { params: { id: ids.deletedCustomer! } });
    expect(deleted.status).toBe(404);
    expect(deleted.body.error).toEqual({
      code: "NOT_FOUND",
      message_en: "Not found.",
      message_bn: "পাওয়া যায়নি।",
      message_bn_key: "errors.NOT_FOUND",
      details: { entity: "customer", id: ids.deletedCustomer },
    });
    expect((await call(getPart, { params: { id: "0192e011-2a4c-7f3e-b5d1-9c8a7e6f5d40" } })).status).toBe(
      404,
    );
    const bad = await call(getPart, { params: { id: "not-a-uuid" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({
      code: "VALIDATION_FAILED",
      details: { issues: [{ path: "id" }] },
    });
  });

  it("refuses a missing, unknown, revoked or Bearer-only key with 401, and a key without the scope with 403", async () => {
    for (const key of [null, `ggk_${"x".repeat(32)}`, REVOKED_KEY, "not-a-key"]) {
      const answer = await call(getPart, { params: { id: ids.part! }, key });
      expect(answer.status).toBe(401);
      expect(answer.body.error).toMatchObject({ code: "UNAUTHORIZED" });
    }
    const bearer = await call(getPart, {
      params: { id: ids.part! },
      key: null,
      headers: { authorization: "Bearer owner-login" }, // the owner's login comes with slice C
    });
    expect(bearer.status).toBe(401);
    expect((await call(getPart, { params: { id: ids.part! }, key: READ_ONLY_KEY })).status).toBe(200);
    const noRead = await call(getPart, { params: { id: ids.part! }, key: NO_READ_KEY });
    expect(noRead.status).toBe(403);
    expect(noRead.body.error).toMatchObject({ code: "FORBIDDEN_SCOPE", details: { required: "read" } });
    const used = await shop.admin.query("select last_used_at from api_keys where key_prefix = 'ggk_read'");
    expect(used.rows[0].last_used_at).not.toBeNull();
  });

  it("replays the same Idempotency-Key and body, refuses it with another body, and writes once", async () => {
    const headers = { "idempotency-key": "test-key-0001" };
    const before = await auditCount();
    const first = await call(testWrite, { method: "POST", body: { n: 1, note: "a" }, headers });
    expect(first.status).toBe(201);
    expect(first.headers.get("idempotent-replayed")).toBeNull();
    // the same body with its keys in another order is the same request
    const again = await call(testWrite, { method: "POST", body: { note: "a", n: 1 }, headers });
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect(await auditCount()).toBe(before + 1);
    const other = await call(testWrite, { method: "POST", body: { n: 2 }, headers });
    expect(other.status).toBe(422);
    expect(other.body.error).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    const bad = await call(testWrite, {
      method: "POST",
      body: { n: 3 },
      headers: { "idempotency-key": "short" },
    });
    expect(bad.status).toBe(400);
  });

  it("lets two requests with the same key at once write once, the second replaying the first", async () => {
    const before = await auditCount();
    const headers = { "idempotency-key": "test-key-together" };
    const answers = await Promise.all([
      call(testWrite, { method: "POST", body: { n: 7 }, headers }),
      call(testWrite, { method: "POST", body: { n: 7 }, headers }),
    ]);
    expect(answers.map((answer) => answer.status)).toEqual([201, 201]);
    expect(answers.filter((answer) => answer.headers.get("idempotent-replayed") === "true")).toHaveLength(1);
    expect(await auditCount()).toBe(before + 1);
  });

  it("leaves no key behind when the service refuses, so the same key can be tried again", async () => {
    const headers = { "idempotency-key": "test-key-refused" };
    fail = true;
    const refused = await call(testWrite, { method: "POST", body: { n: 4 }, headers });
    fail = false;
    expect(refused.status).toBe(422);
    const rows = await database().select().from(idempotencyKeys);
    expect(rows.map((row) => row.key)).not.toContain("test-key-refused");
    expect((await call(testWrite, { method: "POST", body: { n: 4 }, headers })).status).toBe(201);
  });

  it("rolls a dry run back: the same answer with dry_run true, no write and no key", async () => {
    const before = await auditCount();
    const dry = await call(testWrite, {
      method: "POST",
      path: "/api/v1/test-writes?dry_run=true",
      body: { n: 5 },
      headers: { "idempotency-key": "test-key-dry" },
    });
    expect(dry.status).toBe(201);
    expect(dry.body).toEqual({ n: 5, dry_run: true });
    expect(await auditCount()).toBe(before);
    const keys = await shop.admin.query("select 1 from idempotency_keys where key = 'test-key-dry'");
    expect(keys.rows).toHaveLength(0);
  });

  it("stores X-Acting-User with the key's audit source, and refuses one over 100 characters", async () => {
    await call(testWrite, { method: "POST", body: { n: 6 }, headers: { "x-acting-user": "Karim (staff)" } });
    const row = await shop.admin.query(
      "select source, acting_user from audit_logs where action = 'test.write' order by id desc limit 1",
    );
    expect(row.rows[0]).toEqual({ source: "ai", acting_user: "Karim (staff)" });
    const long = await call(testWrite, {
      method: "POST",
      body: { n: 6 },
      headers: { "x-acting-user": "x".repeat(101) },
    });
    expect(long.status).toBe(400);
  });
});
