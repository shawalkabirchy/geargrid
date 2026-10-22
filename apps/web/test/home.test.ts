import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as recordSale } from "../app/api/v1/sales/route";
import { database } from "../src/server/db";
import { accountBalances, todaySummary } from "../src/server/services/home";
import { getSettings, setLanguage, settingsInput, updateSettings } from "../src/server/services/settings";
import { call, createTestShop, first, inCi, type TestShop } from "./harness";

// The web dashboard's first services (DokaanBondhu spec D193, C1): the home screen's today summary agrees with the
// rows it sums and moves by exactly a new sale; settings save every field with a web audit row.

describe.skipIf(!inCi)("home and settings", () => {
  let shop: TestShop;
  let ownerId = "";

  beforeAll(async () => {
    shop = await createTestShop("home");
    ownerId = (await first<{ id: string }>(shop, "select id from users where role = 'owner'")).id;
  }, 180_000);

  afterAll(async () => shop?.drop());

  it("sums today's sales, profit and cash, and moves by exactly one new cash sale", async () => {
    const now = new Date();
    const before = await todaySummary(database(), now);
    const part = await first<{ id: string; retail_price: string; avg_cost: string }>(
      shop,
      `select p.id, p.retail_price, p.avg_cost from parts p join stock_levels l on l.part_id = p.id
       where l.quantity >= 5 and p.is_active and p.deleted_at is null order by p.name_en limit 1`,
    );
    const items = [{ part_id: part.id, quantity: 2 }];
    // the bill's total at the retail price, from a dry run on credit to a retail customer (a walk-in cannot owe)
    const retail = await first<{ id: string }>(
      shop,
      "select id from customers where price_tier = 'retail' and deleted_at is null order by name limit 1",
    );
    const dry = await call(recordSale, {
      method: "POST",
      path: "/api/v1/sales?dry_run=true",
      body: { customer_id: retail.id, items, payments: [] },
    });
    const total = (dry.body.sale as { total_taka: number }).total_taka;
    const answer = await call(recordSale, {
      method: "POST",
      path: "/api/v1/sales",
      body: { items, payments: [{ method: "cash", amount_taka: total }] },
    });
    expect(answer.status).toBe(201);

    const after = await todaySummary(database(), new Date());
    expect(after.salesCount).toBe(before.salesCount + 1);
    expect(after.sales - before.sales).toBe(BigInt(total));
    expect(after.profit - before.profit).toBe(BigInt(total) - 2n * BigInt(part.avg_cost));
    expect(after.cashInHand - before.cashInHand).toBe(BigInt(total));
  });

  it("agrees with the account rows and lists only pending cheques due within seven days", async () => {
    const summary = await todaySummary(database(), new Date());
    for (const account of await accountBalances(database())) {
      const row = await first<{ balance: string }>(
        shop,
        `select a.opening_balance + coalesce((select sum(case when direction = 'in' then amount else -amount end)
           from account_transactions where account_id = a.id and deleted_at is null), 0) as balance
         from accounts a where a.id = $1`,
        [account.id],
      );
      expect(account.balance).toBe(BigInt(row.balance));
    }
    const due = await first<{ count: string }>(
      shop,
      `select count(*) from cheques where status in ('pending', 'deposited') and deleted_at is null
       and due_date <= (now() at time zone 'Asia/Dhaka')::date + 7`,
    );
    expect(summary.chequesDue).toHaveLength(Number(due.count));
  });

  it("saves the settings with an audit row from the web, and refuses what is not allowed", async () => {
    const actor = { source: "web" as const, userId: ownerId, actingUser: "Shop Owner (demo)" };
    const current = await getSettings(database());
    const input = settingsInput.parse({
      shopName: "  Test Auto Parts ",
      marketArea: "",
      phone: "01711-000001",
      address: current.address ?? "",
      language: "en",
      banglaDigits: false,
      roundOffRule: 5,
    });
    const saved = await database().transaction((tx) => updateSettings(tx, actor, input));
    expect(saved).toMatchObject({
      shopName: "Test Auto Parts",
      marketArea: null,
      language: "en",
      roundOffRule: 5,
    });
    const row = await first<{ source: string; user_id: string; after: { shop_name: string } }>(
      shop,
      "select source, user_id, after from audit_logs where action = 'settings.update' order by id desc limit 1",
    );
    expect(row).toMatchObject({ source: "web", user_id: ownerId, after: { shop_name: "Test Auto Parts" } });

    const audits = async () =>
      Number((await first<{ count: string }>(shop, "select count(*) from audit_logs")).count);
    const count = await audits();
    await database().transaction((tx) => setLanguage(tx, actor, "en")); // already English: nothing written
    expect(await audits()).toBe(count);
    await database().transaction((tx) => setLanguage(tx, actor, "bn"));
    expect((await getSettings(database())).language).toBe("bn");

    expect(settingsInput.safeParse({ ...input, shopName: " " }).success).toBe(false);
    expect(settingsInput.safeParse({ ...input, roundOffRule: 3 }).success).toBe(false);
  });
});
