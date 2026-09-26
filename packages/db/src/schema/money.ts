import { sql } from "drizzle-orm";
import { boolean, check, date, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { commonColumns, money, nonNegative, oneOf, positive, timestamptz } from "./columns";
import {
  ACCOUNT_DIRECTIONS,
  ACCOUNT_KINDS,
  CHEQUE_DIRECTIONS,
  CHEQUE_PARTY_TYPES,
  CHEQUE_STATUSES,
} from "./enums";

// Money: accounts, their movements, daily closings, expenses and cheques (spec 5.2).

export const accounts = pgTable(
  "accounts",
  {
    ...commonColumns(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    number: text("number"),
    openingBalance: money("opening_balance")
      .notNull()
      .default(sql`0`),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    check("accounts_kind_check", oneOf(t.kind, ACCOUNT_KINDS)),
    check("accounts_opening_balance_check", nonNegative(t.openingBalance)),
  ],
);

/** One row per account movement; a transfer (slice C) is two rows sharing ref_type 'transfer' and ref_id. */
export const accountTransactions = pgTable(
  "account_transactions",
  {
    ...commonColumns(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    direction: text("direction").notNull(),
    amount: money("amount").notNull(),
    refType: text("ref_type").notNull(),
    refId: uuid("ref_id"),
    note: text("note"),
  },
  (t) => [
    check("account_transactions_direction_check", oneOf(t.direction, ACCOUNT_DIRECTIONS)),
    check("account_transactions_amount_check", positive(t.amount)),
    index("account_transactions_account_id_idx").on(t.accountId),
  ],
);

export const dailyClosings = pgTable(
  "daily_closings",
  {
    ...commonColumns(),
    date: date("date").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    expectedBalance: money("expected_balance").notNull(),
    countedBalance: money("counted_balance").notNull(),
    difference: money("difference").notNull(), // signed
  },
  (t) => [
    check("daily_closings_expected_balance_check", nonNegative(t.expectedBalance)),
    check("daily_closings_counted_balance_check", nonNegative(t.countedBalance)),
    unique("daily_closings_date_account_unique").on(t.date, t.accountId),
    index("daily_closings_account_id_idx").on(t.accountId),
  ],
);

export const expenseCategories = pgTable("expense_categories", {
  ...commonColumns(),
  nameEn: text("name_en").notNull(),
  nameBn: text("name_bn"),
});

export const expenses = pgTable(
  "expenses",
  {
    ...commonColumns(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    amount: money("amount").notNull(),
    note: text("note"),
    spentAt: timestamptz("spent_at").notNull(),
  },
  (t) => [
    check("expenses_amount_check", positive(t.amount)),
    index("expenses_category_id_idx").on(t.categoryId),
    index("expenses_account_id_idx").on(t.accountId),
  ],
);

export const cheques = pgTable(
  "cheques",
  {
    ...commonColumns(),
    direction: text("direction").notNull(),
    partyType: text("party_type").notNull(),
    partyId: uuid("party_id").notNull(), // a customer or a supplier, by party_type
    bank: text("bank").notNull(),
    chequeNo: text("cheque_no").notNull(),
    amount: money("amount").notNull(),
    dueDate: date("due_date").notNull(),
    status: text("status").notNull().default("pending"),
  },
  (t) => [
    check("cheques_direction_check", oneOf(t.direction, CHEQUE_DIRECTIONS)),
    check("cheques_party_type_check", oneOf(t.partyType, CHEQUE_PARTY_TYPES)),
    check("cheques_amount_check", positive(t.amount)),
    check("cheques_status_check", oneOf(t.status, CHEQUE_STATUSES)),
  ],
);
