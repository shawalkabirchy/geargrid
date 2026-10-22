import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database, type Tx } from "../src/server/db";
import type { AuditActor } from "../src/server/posting";
import { todaySummary } from "../src/server/services/home";
import {
  addDefaultExpenseCategories,
  addExpense,
  allAccounts,
  balanceAt,
  cashBook,
  closeDay,
  expenseCategoryOptions,
  listCheques,
  listExpenses,
  moveCheque,
  paySupplier,
  transfer,
} from "../src/server/services/money";
import { addTrxId, needsReview } from "../src/server/services/review";
import { createSale } from "../src/server/services/sales";
import {
  adjustStock,
  countStock,
  deadStock,
  lowStock,
  rackParts,
  stockValue,
} from "../src/server/services/stock";
import { addDays, dhakaDate } from "@geargrid/core";
import {
  createTestShop,
  dueOfCustomer,
  failedChecks,
  first,
  inCi,
  payableOfSupplier,
  stockOfPart,
  type TestShop,
} from "./harness";

// Money and stock on the web dashboard (DokaanBondhu spec D193, C4): paying a supplier, cheques that clear or bounce,
// transfers, the cash book and the daily closing, expenses, stock adjustments and counts, and the "needs review" list.
// db:check passes after each.

describe.skipIf(!inCi)("money and stock on the web", () => {
  let shop: TestShop;
  let actor: AuditActor;
  const db = () => database();
  const run = <T>(change: (tx: Tx) => Promise<T>) => db().transaction(change);
  const account = async (kind: string) => (await allAccounts(db())).find((a) => a.kind === kind)!;
  const today = dhakaDate(new Date());

  beforeAll(async () => {
    shop = await createTestShop("moneyweb");
    const owner = await first<{ id: string }>(shop, "select id from users where role = 'owner'");
    actor = { source: "web", userId: owner.id, actingUser: "Shop Owner (demo)" };
  }, 180_000);

  afterAll(async () => shop?.drop());

  it("pays a supplier in cash and by cheque, never more than owed; the cheque moves money only when it clears", async () => {
    const supplier = await first<{ id: string; payable_balance: string }>(
      shop,
      "select id, payable_balance from suppliers where payable_balance > 2000 order by name limit 1",
    );
    const payable = Number(supplier.payable_balance);
    const cash = await account("cash");
    const bank = await account("bank");

    await run((tx) =>
      paySupplier(tx, actor, {
        supplierId: supplier.id,
        amount: 1000,
        method: "cash",
        accountId: null,
        trxId: null,
        cheque: null,
      }),
    );
    expect(await payableOfSupplier(shop, supplier.id)).toBe(payable - 1000);
    expect(BigInt((await account("cash")).balance)).toBe(BigInt(cash.balance) - 1000n);
    await expect(
      run((tx) =>
        paySupplier(tx, actor, {
          supplierId: supplier.id,
          amount: payable,
          method: "cash",
          accountId: null,
          trxId: null,
          cheque: null,
        }),
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_EXCEEDS_PAYABLE" });

    await run((tx) =>
      paySupplier(tx, actor, {
        supplierId: supplier.id,
        amount: 500,
        method: "cheque",
        accountId: null,
        trxId: null,
        cheque: { bank: "Test Bank", chequeNo: "C-1", dueDate: today },
      }),
    );
    expect(await payableOfSupplier(shop, supplier.id)).toBe(payable - 1500);
    expect((await account("bank")).balance).toBe(bank.balance);
    const issued = (await listCheques(db(), "pending")).find((c) => c.cheque_no === "C-1")!;
    await expect(
      run((tx) => moveCheque(tx, actor, { id: issued.id, action: "deposit", accountId: null })),
    ).rejects.toMatchObject({
      code: "CHEQUE_STATUS",
    });
    await run((tx) => moveCheque(tx, actor, { id: issued.id, action: "clear", accountId: bank.id }));
    expect(BigInt((await account("bank")).balance)).toBe(BigInt(bank.balance) - 500n);
    await expect(
      run((tx) => moveCheque(tx, actor, { id: issued.id, action: "bounce", accountId: null })),
    ).rejects.toMatchObject({
      code: "CHEQUE_STATUS",
    });
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("puts a bounced customer's cheque back on the due, and clears another into the bank", async () => {
    const received = (await listCheques(db(), "pending")).filter((c) => c.direction === "received");
    expect(received.length).toBeGreaterThan(0);
    const cheque = received[0]!;
    const due = await dueOfCustomer(shop, cheque.party_id);
    await run((tx) => moveCheque(tx, actor, { id: cheque.id, action: "deposit", accountId: null }));
    await run((tx) => moveCheque(tx, actor, { id: cheque.id, action: "bounce", accountId: null }));
    expect(await dueOfCustomer(shop, cheque.party_id)).toBe(due + Number(cheque.amount));
    const line = await first<{ entry_type: string; ref_type: string }>(
      shop,
      "select entry_type, ref_type from customer_ledger where customer_id = $1 order by seq desc limit 1",
      [cheque.party_id],
    );
    expect(line).toEqual({ entry_type: "cheque_bounce", ref_type: "cheque" });
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("transfers between accounts, and the cash book and the closing agree with the balances", async () => {
    const cash = await account("cash");
    const bank = await account("bank");
    await run((tx) =>
      transfer(tx, actor, { fromId: cash.id, toId: bank.id, amount: 2000, note: "to the bank" }),
    );
    expect(BigInt((await account("cash")).balance)).toBe(BigInt(cash.balance) - 2000n);
    expect(BigInt((await account("bank")).balance)).toBe(BigInt(bank.balance) + 2000n);
    const pair = await shop.admin.query<{ direction: string; note: string }>(
      "select direction, note from account_transactions where ref_type = 'transfer' order by direction",
    );
    expect(pair.rows).toEqual([
      { direction: "in", note: "to the bank" },
      { direction: "out", note: "to the bank" },
    ]);

    const book = await cashBook(db(), cash.id, addDays(today, -60), today);
    expect(book.closing).toBe(book.opening + book.moneyIn - book.moneyOut);
    expect(book.closing).toBe(BigInt((await account("cash")).balance));
    // the seed's cash box and bank end below zero in the books, which the closing refuses; bKash is above zero
    const bkash = await account("bkash");
    await expect(
      run((tx) => closeDay(tx, actor, { accountId: cash.id, date: today, counted: 0 })),
    ).rejects.toMatchObject({ code: "BALANCE_BELOW_ZERO" });
    const end = await balanceAt(db(), bkash.id, new Date(`${addDays(today, 1)}T00:00:00+06:00`));
    const closed = await run((tx) =>
      closeDay(tx, actor, { accountId: bkash.id, date: today, counted: Number(end) - 50 }),
    );
    expect(closed).toEqual({ expected: end, difference: -50n });
    await expect(
      run((tx) => closeDay(tx, actor, { accountId: bkash.id, date: today, counted: 0 })),
    ).rejects.toMatchObject({ code: "DAY_ALREADY_CLOSED" });
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("adds the usual expense categories once and records expenses, which Home counts", async () => {
    await run((tx) => addDefaultExpenseCategories(tx, actor));
    await run((tx) => addDefaultExpenseCategories(tx, actor));
    const categories = await expenseCategoryOptions(db());
    expect(categories.map((c) => c.name_en)).toEqual([
      "Electricity",
      "Labour",
      "Others",
      "Rent",
      "Tea and snacks",
      "Transport",
    ]);
    const before = await todaySummary(db(), new Date());
    const cash = await account("cash");
    const tea = categories.find((c) => c.name_en === "Tea and snacks")!;
    await run((tx) =>
      addExpense(tx, actor, { categoryId: tea.id, accountId: cash.id, amount: 120, note: null, date: today }),
    );
    await expect(
      run((tx) =>
        addExpense(tx, actor, {
          categoryId: tea.id,
          accountId: cash.id,
          amount: 1,
          note: null,
          date: addDays(today, 1),
        }),
      ),
    ).rejects.toMatchObject({ code: "DATE_IN_FUTURE" });
    const after = await todaySummary(db(), new Date());
    expect(after.expenses - before.expenses).toBe(120n);
    expect(after.profit - before.profit).toBe(-120n);
    expect((await listExpenses(db(), today, today)).map((e) => e.amount)).toContain("120");
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("adjusts stock, counts a rack, and lists low and dead stock from the same numbers", async () => {
    const part = await first<{ id: string; quantity: string; rack_location: string }>(
      shop,
      `select p.id, l.quantity, p.rack_location from parts p join stock_levels l on l.part_id = p.id
       where p.rack_location is not null and p.is_active and p.deleted_at is null order by p.name_en limit 1`,
    );
    const stock = Number(part.quantity);
    await run((tx) => adjustStock(tx, actor, { partId: part.id, change: "2", reason: "found", note: null }));
    expect(await stockOfPart(shop, part.id)).toBe(stock + 2);

    const sheet = await rackParts(db(), part.rack_location);
    const counts = sheet.map((row) => ({
      partId: row.id,
      counted: row.id === part.id ? String(stock) : String(Number(row.stock)),
    }));
    const adjusted = await run((tx) => countStock(tx, actor, { counts }));
    expect(adjusted).toBe(1);
    expect(await stockOfPart(shop, part.id)).toBe(stock);

    const low = await lowStock(db());
    for (const row of low) {
      expect(
        Number(row.stock) < 0 ||
          (Number(row.reorder_level) > 0 && Number(row.stock) <= Number(row.reorder_level)),
      ).toBe(true);
    }
    const dead = await deadStock(db());
    const since = Date.now() - 90 * 86_400_000;
    for (const row of dead) {
      expect(Number(row.stock)).toBeGreaterThan(0);
      expect(row.last_sale === null || row.last_sale.getTime() < since).toBe(true);
    }
    const value = await stockValue(db());
    expect(value.value).toBeGreaterThan(0n);
    expect(await failedChecks(shop)).toEqual([]);
  });

  it("lists a bKash sale without a TrxID for review and clears its flag once the TrxID is added", async () => {
    const part = await first<{ id: string; retail_price: string; garage_price: string | null }>(
      shop,
      `select p.id, p.retail_price, p.garage_price from parts p join stock_levels l on l.part_id = p.id
       where l.quantity >= 5 and p.is_active and p.deleted_at is null order by p.name_en desc limit 1`,
    );
    const price = Number(part.retail_price);
    const answer = await run((tx) =>
      createSale({
        tx,
        actor,
        params: undefined,
        query: undefined,
        now: new Date(),
        dryRun: false,
        body: {
          items: [{ part_id: part.id, quantity: 1, unit_price_taka: price }],
          payments: [{ method: "bkash", amount_taka: price }],
        },
      }),
    );
    const sale = answer.body.sale as { id: string; flags: string[]; payments: { id: string }[] };
    expect(sale.flags).toContain("TRX_ID_MISSING");
    const waiting = (await needsReview(db())).missingTrx.find((row) => row.id === sale.payments[0]!.id)!;
    expect(waiting).toMatchObject({ kind: "sale_payment", link: `/sales/${sale.id}` });
    await run((tx) => addTrxId(tx, actor, { kind: "sale_payment", id: waiting.id, trxId: "BK123" }));
    const flags = await first<{ flags: string[] }>(shop, "select flags from sales where id = $1", [sale.id]);
    expect(flags.flags).not.toContain("TRX_ID_MISSING");
    expect((await needsReview(db())).missingTrx.map((row) => row.id)).not.toContain(waiting.id);
  });
});
