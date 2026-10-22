import { addDays, uuidv7 } from "@geargrid/core";
import {
  ACCOUNT_KINDS,
  type Db,
  accounts,
  cheques,
  dailyClosings,
  expenseCategories,
  expenses,
  supplierPayments,
} from "@geargrid/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "../db";
import { apiError } from "../http/errors";
import {
  addCheque,
  audit,
  changed,
  customerEntry,
  lockCustomer,
  lockSupplier,
  moveMoney,
  paymentAccount,
  supplierEntry,
  type AuditActor,
} from "../posting";
import { webError } from "./catalog-edit";

// Money on the web dashboard (GearGrid plan 2.7, 2.8; DokaanBondhu spec D193, C4): paying a supplier, accounts and
// transfers, the cash book, the daily closing, expenses and the cheques. Every write is one transaction with its
// ledger, account, audit and change-log rows, posted the way the seed and the API post them (spec 6.6):
//   - a supplier payment: a "payment" line on the supplier's ledger and money out (a cheque: no money until it clears);
//   - a transfer: two account rows sharing ref_type "transfer" and one ref_id;
//   - a cheque that clears: money in (received) or out (issued) of the bank account chosen;
//   - a cheque that bounces: the amount goes back on the ledger (a customer's "cheque_bounce", a supplier's
//     "payment_reversal"), so the due or payable is as if it had never been paid.
// An account may go below zero in the books: they can lag the drawer, and the daily closing shows the difference.

type Reader = Db | Tx;
const DHAKA = (date: string) => new Date(`${date}T00:00:00+06:00`);

const takaAmount = z.number().int().positive().max(100_000_000);
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---- Supplier payments

export const supplierPaymentInput = z
  .object({
    supplierId: z.uuid(),
    amount: takaAmount,
    method: z.enum(["cash", "bkash", "nagad", "rocket", "bank", "cheque"]),
    accountId: z.uuid().nullable(),
    trxId: optionalText(64),
    cheque: z.object({ bank: text(60), chequeNo: text(30), dueDate: isoDate }).nullable(),
  })
  .refine((value) => value.method !== "cheque" || value.cheque !== null, { path: ["cheque"] });
export type SupplierPaymentInput = z.infer<typeof supplierPaymentInput>;

/** Never more than what the shop owes the supplier, as a customer's payment is never more than the due (D26). */
export async function paySupplier(tx: Tx, actor: AuditActor, input: SupplierPaymentInput, now = new Date()) {
  const supplier = await lockSupplier(tx, input.supplierId);
  const amount = BigInt(input.amount);
  if (amount > supplier.payableBalance) {
    throw webError("PAYMENT_EXCEEDS_PAYABLE", { payable_taka: Number(supplier.payableBalance) });
  }
  const accountId =
    input.method === "cheque" ? null : await paymentAccount(tx, input.method, input.accountId ?? undefined);
  const id = uuidv7();
  const chequeId =
    input.method === "cheque"
      ? await addCheque(tx, {
          direction: "issued",
          partyType: "supplier",
          partyId: supplier.id,
          bank: input.cheque!.bank,
          chequeNo: input.cheque!.chequeNo,
          dueDate: input.cheque!.dueDate,
          amount,
          now,
        })
      : null;
  await tx.insert(supplierPayments).values({
    id,
    supplierId: supplier.id,
    purchaseId: null,
    accountId,
    amount,
    method: input.method,
    trxId: input.trxId,
    chequeId,
    paidAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await changed(tx, "supplier_payments", id);
  await supplierEntry(tx, supplier, {
    type: "payment",
    refType: "supplier_payment",
    refId: id,
    debit: 0n,
    credit: amount,
    now,
  });
  if (accountId) {
    await moveMoney(tx, { accountId, direction: "out", amount, refType: "supplier_payment", refId: id, now });
  }
  await audit(tx, actor, "supplier_payment.create", "supplier_payment", id, null, {
    supplier_id: supplier.id,
    amount_taka: input.amount,
    method: input.method,
    account_id: accountId,
    cheque_id: chequeId,
  });
  return id;
}

// ---- Accounts and transfers

export const accountInput = z.object({
  name: text(60),
  kind: z.enum(ACCOUNT_KINDS),
  number: optionalText(40),
  openingBalance: z.number().int().nonnegative().max(1_000_000_000),
});
export type AccountInput = z.infer<typeof accountInput>;

export async function addAccount(
  tx: Tx,
  actor: AuditActor,
  input: AccountInput,
  now = new Date(),
): Promise<string> {
  const [row] = await tx
    .insert(accounts)
    .values({
      id: uuidv7(),
      name: input.name,
      kind: input.kind,
      number: input.number,
      openingBalance: BigInt(input.openingBalance),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await changed(tx, "accounts", row!.id);
  await audit(tx, actor, "account.create", "account", row!.id, null, { ...input });
  return row!.id;
}

export const accountEdit = z.object({ name: text(60), number: optionalText(40), isActive: z.boolean() });

/** Name, number and whether it is in use; the kind and the opening balance never change once money has moved. */
export async function editAccount(
  tx: Tx,
  actor: AuditActor,
  id: string,
  input: z.infer<typeof accountEdit>,
  now = new Date(),
): Promise<void> {
  const [before] = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), isNull(accounts.deletedAt)))
    .for("update");
  if (!before) throw apiError("NOT_FOUND", { entity: "account", id });
  await tx
    .update(accounts)
    .set({ ...input, updatedAt: now, version: sql`${accounts.version} + 1` })
    .where(eq(accounts.id, id));
  await changed(tx, "accounts", id);
  await audit(
    tx,
    actor,
    "account.update",
    "account",
    id,
    { name: before.name, number: before.number, is_active: before.isActive },
    { name: input.name, number: input.number, is_active: input.isActive },
  );
}

export const transferInput = z
  .object({ fromId: z.uuid(), toId: z.uuid(), amount: takaAmount, note: optionalText(200) })
  .refine((value) => value.fromId !== value.toId, { path: ["toId"] });

async function activeAccount(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), isNull(accounts.deletedAt)));
  if (!row) throw apiError("NOT_FOUND", { entity: "account", id });
  if (!row.isActive) throw apiError("ACCOUNT_INVALID", { account_id: id });
  return row;
}

/** Money from one account to another (cash into the bank, a bKash cash-out): two rows, one ref_id. */
export async function transfer(
  tx: Tx,
  actor: AuditActor,
  input: z.infer<typeof transferInput>,
  now = new Date(),
): Promise<string> {
  await activeAccount(tx, input.fromId);
  await activeAccount(tx, input.toId);
  const refId = uuidv7();
  const amount = BigInt(input.amount);
  for (const [accountId, direction] of [
    [input.fromId, "out"],
    [input.toId, "in"],
  ] as const) {
    await moveMoney(tx, { accountId, direction, amount, refType: "transfer", refId, now, note: input.note });
  }
  await audit(tx, actor, "transfer.create", "transfer", refId, null, {
    from_account_id: input.fromId,
    to_account_id: input.toId,
    amount_taka: input.amount,
    note: input.note,
  });
  return refId;
}

/** An account's balance at an instant: the opening balance plus everything in, minus everything out, before it. */
export async function balanceAt(db: Reader, accountId: string, at: Date): Promise<bigint> {
  const result = await db.execute<{ balance: string }>(sql`
    select a.opening_balance + coalesce((select sum(case when t.direction = 'in' then t.amount else -t.amount end)
      from account_transactions t where t.account_id = a.id and t.deleted_at is null and t.created_at < ${at}), 0)
      as balance
    from accounts a where a.id = ${accountId}`);
  return BigInt(result.rows[0]?.balance ?? "0");
}

export type CashBookLine = {
  id: string;
  created_at: Date;
  direction: "in" | "out";
  amount: string;
  ref_type: string;
  note: string | null;
  reference: string | null;
};

/** One account between two Dhaka dates (inclusive): the opening balance, each movement, the closing balance. */
export async function cashBook(db: Reader, accountId: string, from: string, to: string) {
  const start = DHAKA(from);
  const end = DHAKA(addDays(to, 1));
  const opening = await balanceAt(db, accountId, start);
  const rows = await db.execute<CashBookLine>(sql`
    select t.id, t.created_at, t.direction, t.amount, t.ref_type, t.note,
           coalesce(s.invoice_no, p.bill_no, c.name, su.name, ec.name_en) as reference
    from account_transactions t
    left join sales s on t.ref_type = 'sale' and s.id = t.ref_id
    left join returns r on t.ref_type = 'return' and r.id = t.ref_id
    left join purchases p on t.ref_type = 'purchase' and p.id = t.ref_id
    left join customer_payments cp on t.ref_type = 'customer_payment' and cp.id = t.ref_id
    left join customers c on c.id = coalesce(cp.customer_id, r.customer_id)
    left join supplier_payments sp on t.ref_type = 'supplier_payment' and sp.id = t.ref_id
    left join suppliers su on su.id = sp.supplier_id
    left join expenses e on t.ref_type = 'expense' and e.id = t.ref_id
    left join expense_categories ec on ec.id = e.category_id
    where t.account_id = ${accountId} and t.deleted_at is null and t.created_at >= ${start} and t.created_at < ${end}
    order by t.created_at, t.id`);
  const lines = rows.rows.map((row) => ({ ...row, created_at: new Date(row.created_at) }));
  const moneyIn = lines.filter((l) => l.direction === "in").reduce((s, l) => s + BigInt(l.amount), 0n);
  const moneyOut = lines.filter((l) => l.direction === "out").reduce((s, l) => s + BigInt(l.amount), 0n);
  return { opening, lines, moneyIn, moneyOut, closing: opening + moneyIn - moneyOut };
}

// ---- Daily closing

export const closingInput = z.object({
  accountId: z.uuid(),
  date: isoDate,
  counted: z.number().int().nonnegative(),
});

/** The owner's count for an account at the end of a day; the app shows the difference and changes no balance. */
export async function closeDay(
  tx: Tx,
  actor: AuditActor,
  input: z.infer<typeof closingInput>,
  now = new Date(),
): Promise<{ expected: bigint; difference: bigint }> {
  await activeAccount(tx, input.accountId);
  const expected = await balanceAt(tx, input.accountId, DHAKA(addDays(input.date, 1)));
  if (expected < 0n) throw webError("BALANCE_BELOW_ZERO", { expected_taka: Number(expected) });
  const [same] = await tx
    .select({ id: dailyClosings.id })
    .from(dailyClosings)
    .where(
      and(
        eq(dailyClosings.accountId, input.accountId),
        eq(dailyClosings.date, input.date),
        isNull(dailyClosings.deletedAt),
      ),
    );
  if (same) throw webError("DAY_ALREADY_CLOSED");
  const counted = BigInt(input.counted);
  const id = uuidv7();
  await tx.insert(dailyClosings).values({
    id,
    date: input.date,
    accountId: input.accountId,
    expectedBalance: expected,
    countedBalance: counted,
    difference: counted - expected,
    createdAt: now,
    updatedAt: now,
  });
  await changed(tx, "daily_closings", id);
  await audit(tx, actor, "daily_closing.create", "daily_closing", id, null, {
    date: input.date,
    account_id: input.accountId,
    expected_taka: Number(expected),
    counted_taka: input.counted,
  });
  return { expected, difference: counted - expected };
}

export type ClosingRow = {
  id: string;
  date: string;
  expected_balance: string;
  counted_balance: string;
  difference: string;
};

export async function closings(db: Reader, accountId: string): Promise<ClosingRow[]> {
  const result = await db.execute<ClosingRow>(sql`
    select id, to_char(date, 'YYYY-MM-DD') as date, expected_balance, counted_balance, difference
    from daily_closings where account_id = ${accountId} and deleted_at is null
    order by date desc limit 30`);
  return result.rows;
}

// ---- Expenses

/** The plan's six categories (GearGrid plan 2.8), added on the owner's word when the shop has none yet. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  ["Rent", "ভাড়া"],
  ["Electricity", "বিদ্যুৎ"],
  ["Transport", "পরিবহন"],
  ["Labour", "মজুরি"],
  ["Tea and snacks", "চা-নাস্তা"],
  ["Others", "অন্যান্য"],
] as const;

export const categoryInput = z.object({ nameEn: text(60), nameBn: optionalText(60) });

export async function addExpenseCategory(
  tx: Tx,
  actor: AuditActor,
  input: z.infer<typeof categoryInput>,
  now = new Date(),
): Promise<string> {
  const [same] = await tx
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(
      and(
        sql`lower(${expenseCategories.nameEn}) = lower(${input.nameEn})`,
        isNull(expenseCategories.deletedAt),
      ),
    );
  if (same) throw webError("CATEGORY_EXISTS");
  const id = uuidv7();
  await tx.insert(expenseCategories).values({ id, ...input, createdAt: now, updatedAt: now });
  await changed(tx, "expense_categories", id);
  await audit(tx, actor, "expense_category.create", "expense_category", id, null, { ...input });
  return id;
}

export async function addDefaultExpenseCategories(
  tx: Tx,
  actor: AuditActor,
  now = new Date(),
): Promise<void> {
  const [any] = await tx
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(isNull(expenseCategories.deletedAt))
    .limit(1);
  if (any) return;
  for (const [nameEn, nameBn] of DEFAULT_EXPENSE_CATEGORIES) {
    await addExpenseCategory(tx, actor, { nameEn, nameBn }, now);
  }
}

export const expenseInput = z.object({
  categoryId: z.uuid(),
  accountId: z.uuid(),
  amount: takaAmount,
  note: optionalText(200),
  date: isoDate,
});

/** An expense paid from an account; dated today it is now, an earlier day is that day at noon. */
export async function addExpense(
  tx: Tx,
  actor: AuditActor,
  input: z.infer<typeof expenseInput>,
  now = new Date(),
): Promise<string> {
  await activeAccount(tx, input.accountId);
  const [category] = await tx
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(and(eq(expenseCategories.id, input.categoryId), isNull(expenseCategories.deletedAt)));
  if (!category) throw apiError("NOT_FOUND", { entity: "expense_category", id: input.categoryId });
  const today = new Date(now.getTime() + 6 * 3600_000).toISOString().slice(0, 10);
  if (input.date > today) throw webError("DATE_IN_FUTURE");
  const spentAt = input.date === today ? now : new Date(`${input.date}T12:00:00+06:00`);
  const id = uuidv7();
  const amount = BigInt(input.amount);
  await tx.insert(expenses).values({
    id,
    categoryId: input.categoryId,
    accountId: input.accountId,
    amount,
    note: input.note,
    spentAt,
    createdAt: now,
    updatedAt: now,
  });
  await changed(tx, "expenses", id);
  await moveMoney(tx, {
    accountId: input.accountId,
    direction: "out",
    amount,
    refType: "expense",
    refId: id,
    now: spentAt,
  });
  await audit(tx, actor, "expense.create", "expense", id, null, {
    category_id: input.categoryId,
    account_id: input.accountId,
    amount_taka: input.amount,
    note: input.note,
    date: input.date,
  });
  return id;
}

export type ExpenseRow = {
  id: string;
  spent_at: Date;
  category: string;
  category_bn: string | null;
  account: string;
  amount: string;
  note: string | null;
};

export async function listExpenses(db: Reader, from: string, to: string): Promise<ExpenseRow[]> {
  const result = await db.execute<ExpenseRow>(sql`
    select e.id, e.spent_at, c.name_en as category, c.name_bn as category_bn, a.name as account, e.amount, e.note
    from expenses e join expense_categories c on c.id = e.category_id join accounts a on a.id = e.account_id
    where e.deleted_at is null and e.spent_at >= ${DHAKA(from)} and e.spent_at < ${DHAKA(addDays(to, 1))}
    order by e.spent_at desc limit 500`);
  return result.rows.map((row) => ({ ...row, spent_at: new Date(row.spent_at) }));
}

export async function expenseCategoryOptions(db: Reader) {
  const result = await db.execute<{ id: string; name_en: string; name_bn: string | null }>(sql`
    select id, name_en, name_bn from expense_categories where deleted_at is null order by name_en`);
  return result.rows;
}

// ---- Cheques

export type ChequeRow = {
  id: string;
  direction: "received" | "issued";
  party_type: "customer" | "supplier";
  party_id: string;
  party: string;
  bank: string;
  cheque_no: string;
  amount: string;
  due_date: string;
  status: string;
};

export async function listCheques(db: Reader, status: string | null): Promise<ChequeRow[]> {
  const result = await db.execute<ChequeRow>(sql`
    select c.id, c.direction, c.party_type, c.party_id, coalesce(cu.name, su.name) as party, c.bank, c.cheque_no,
           c.amount, to_char(c.due_date, 'YYYY-MM-DD') as due_date, c.status
    from cheques c
    left join customers cu on c.party_type = 'customer' and cu.id = c.party_id
    left join suppliers su on c.party_type = 'supplier' and su.id = c.party_id
    where c.deleted_at is null and (${status}::text is null or c.status = ${status})
    order by case c.status when 'pending' then 0 when 'deposited' then 1 else 2 end, c.due_date
    limit 300`);
  return result.rows;
}

export const chequeAction = z
  .object({
    id: z.uuid(),
    action: z.enum(["deposit", "clear", "bounce"]),
    accountId: z.uuid().nullable(),
  })
  .refine((value) => value.action !== "clear" || value.accountId !== null, { path: ["accountId"] });

const NEXT: Record<string, { from: string[]; to: string }> = {
  deposit: { from: ["pending"], to: "deposited" },
  clear: { from: ["pending", "deposited"], to: "cleared" },
  bounce: { from: ["pending", "deposited"], to: "bounced" },
};

/**
 * A cheque moves on: deposited (received ones only), cleared (money in or out of the bank account chosen) or bounced
 * (the amount goes back on the customer's or supplier's ledger).
 */
export async function moveCheque(
  tx: Tx,
  actor: AuditActor,
  input: z.infer<typeof chequeAction>,
  now = new Date(),
): Promise<void> {
  const [cheque] = await tx
    .select()
    .from(cheques)
    .where(and(eq(cheques.id, input.id), isNull(cheques.deletedAt)))
    .for("update");
  if (!cheque) throw apiError("NOT_FOUND", { entity: "cheque", id: input.id });
  const step = NEXT[input.action]!;
  if (!step.from.includes(cheque.status) || (input.action === "deposit" && cheque.direction !== "received")) {
    throw webError("CHEQUE_STATUS", { status: cheque.status });
  }
  if (input.action === "clear") {
    const account = await activeAccount(tx, input.accountId!);
    if (account.kind !== "bank")
      throw apiError("ACCOUNT_INVALID", { account_id: account.id, method: "bank" });
    await moveMoney(tx, {
      accountId: account.id,
      direction: cheque.direction === "received" ? "in" : "out",
      amount: cheque.amount,
      refType: "cheque",
      refId: cheque.id,
      now,
    });
  }
  if (input.action === "bounce") {
    if (cheque.partyType === "customer") {
      const customer = await lockCustomer(tx, cheque.partyId);
      await customerEntry(tx, customer, {
        type: "cheque_bounce",
        refType: "cheque",
        refId: cheque.id,
        debit: cheque.amount,
        credit: 0n,
        now,
      });
    } else {
      const supplier = await lockSupplier(tx, cheque.partyId);
      await supplierEntry(tx, supplier, {
        type: "payment_reversal",
        refType: "cheque",
        refId: cheque.id,
        debit: cheque.amount,
        credit: 0n,
        now,
      });
    }
  }
  await tx
    .update(cheques)
    .set({ status: step.to, updatedAt: now, version: sql`${cheques.version} + 1` })
    .where(eq(cheques.id, cheque.id));
  await changed(tx, "cheques", cheque.id);
  await audit(
    tx,
    actor,
    `cheque.${input.action}`,
    "cheque",
    cheque.id,
    { status: cheque.status },
    {
      status: step.to,
      account_id: input.accountId,
    },
  );
}

export type AccountRow = {
  id: string;
  name: string;
  kind: string;
  number: string | null;
  is_active: boolean;
  opening_balance: string;
  balance: string;
};

/** Every account, in use or not, with its balance now. */
export async function allAccounts(db: Reader): Promise<AccountRow[]> {
  const result = await db.execute<AccountRow>(sql`
    select a.id, a.name, a.kind, a.number, a.is_active, a.opening_balance,
           a.opening_balance + coalesce(sum(case when t.direction = 'in' then t.amount else -t.amount end), 0)
             as balance
    from accounts a
    left join account_transactions t on t.account_id = a.id and t.deleted_at is null
    where a.deleted_at is null
    group by a.id
    order by not a.is_active,
             case a.kind when 'cash' then 0 when 'bkash' then 1 when 'nagad' then 2 when 'rocket' then 3 else 4 end,
             a.name`);
  return result.rows;
}
