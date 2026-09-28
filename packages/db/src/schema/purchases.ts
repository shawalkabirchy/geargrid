import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { commonColumns, money, nonNegative, oneOf, positive, quantity, timestamptz } from "./columns";
import { parts } from "./catalog";
import { PAYMENT_METHODS, PURCHASE_STATUSES, SUPPLIER_LEDGER_ENTRIES } from "./enums";
import { accounts, cheques } from "./money";

// Suppliers and purchases (spec 5.2).

export const suppliers = pgTable(
  "suppliers",
  {
    ...commonColumns(),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    openingPayable: money("opening_payable")
      .notNull()
      .default(sql`0`),
    payableBalance: money("payable_balance")
      .notNull()
      .default(sql`0`),
  },
  (t) => [
    check("suppliers_opening_payable_check", nonNegative(t.openingPayable)),
    check("suppliers_payable_balance_check", nonNegative(t.payableBalance)),
  ],
);

/** A debit raises what the shop owes the supplier, a credit lowers it. */
export const supplierLedger = pgTable(
  "supplier_ledger",
  {
    ...commonColumns(),
    seq: bigint("seq", { mode: "bigint" }).generatedAlwaysAsIdentity(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    entryType: text("entry_type").notNull(),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    debit: money("debit")
      .notNull()
      .default(sql`0`),
    credit: money("credit")
      .notNull()
      .default(sql`0`),
    balanceAfter: money("balance_after").notNull(),
  },
  (t) => [
    check("supplier_ledger_entry_type_check", oneOf(t.entryType, SUPPLIER_LEDGER_ENTRIES)),
    check("supplier_ledger_debit_check", nonNegative(t.debit)),
    check("supplier_ledger_credit_check", nonNegative(t.credit)),
    check("supplier_ledger_one_side_check", sql`(${t.debit} > 0) <> (${t.credit} > 0)`),
    index("supplier_ledger_supplier_id_created_at_idx").on(t.supplierId, t.createdAt),
  ],
);

export const purchases = pgTable(
  "purchases",
  {
    ...commonColumns(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    billNo: text("bill_no"),
    purchaseTime: timestamptz("purchase_time").notNull(),
    total: money("total").notNull(),
    paid: money("paid").notNull(),
    due: money("due").notNull(),
    status: text("status").notNull().default("completed"),
    reversedAt: timestamptz("reversed_at"),
    reversalReason: text("reversal_reason"),
  },
  (t) => [
    check("purchases_total_check", nonNegative(t.total)),
    check("purchases_paid_check", nonNegative(t.paid)),
    check("purchases_due_check", nonNegative(t.due)),
    check("purchases_status_check", oneOf(t.status, PURCHASE_STATUSES)),
    index("purchases_supplier_id_idx").on(t.supplierId),
  ],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    ...commonColumns(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id),
    partId: uuid("part_id")
      .notNull()
      .references(() => parts.id),
    quantity: quantity("quantity").notNull(),
    unitCost: money("unit_cost").notNull(),
    lineTotal: money("line_total").notNull(),
    // The part's average cost just before this line: a reversal puts it back when nothing has moved the part since
    // (spec D93).
    avgCostBefore: money("avg_cost_before").notNull(),
  },
  (t) => [
    check("purchase_items_quantity_check", positive(t.quantity)),
    check("purchase_items_unit_cost_check", nonNegative(t.unitCost)),
    check("purchase_items_line_total_check", nonNegative(t.lineTotal)),
    check("purchase_items_avg_cost_before_check", nonNegative(t.avgCostBefore)),
    index("purchase_items_purchase_id_idx").on(t.purchaseId),
    index("purchase_items_part_id_idx").on(t.partId),
  ],
);

export const supplierPayments = pgTable(
  "supplier_payments",
  {
    ...commonColumns(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    purchaseId: uuid("purchase_id").references(() => purchases.id), // payments made with a purchase
    accountId: uuid("account_id").references(() => accounts.id),
    amount: money("amount").notNull(),
    method: text("method").notNull(),
    trxId: text("trx_id"),
    chequeId: uuid("cheque_id").references(() => cheques.id),
    paidAt: timestamptz("paid_at").notNull(),
  },
  (t) => [
    check("supplier_payments_amount_check", positive(t.amount)),
    check("supplier_payments_method_check", oneOf(t.method, PAYMENT_METHODS)),
    index("supplier_payments_supplier_id_idx").on(t.supplierId),
    index("supplier_payments_purchase_id_idx").on(t.purchaseId),
    index("supplier_payments_account_id_idx").on(t.accountId),
    index("supplier_payments_cheque_id_idx").on(t.chequeId),
  ],
);
