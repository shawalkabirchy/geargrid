import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { commonColumns, money, nonNegative, oneOf, positive, quantity, timestamptz } from "./columns";
import { parts } from "./catalog";
import {
  CUSTOMER_LEDGER_ENTRIES,
  CUSTOMER_PAYMENT_STATUSES,
  CUSTOMER_TYPES,
  PAYMENT_METHODS,
  PRICE_TIERS,
  RESTOCK_OPTIONS,
  SALE_STATUSES,
} from "./enums";
import { accounts, cheques } from "./money";
import { apiKeys, devices } from "./shop";

// Customers and sales (spec 5.2).

export const customers = pgTable(
  "customers",
  {
    ...commonColumns(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    priceTier: text("price_tier").notNull(), // defaults from the type, can be changed
    phone: text("phone"),
    address: text("address"),
    creditLimit: money("credit_limit"), // null = no limit
    openingDue: money("opening_due")
      .notNull()
      .default(sql`0`),
    dueBalance: money("due_balance")
      .notNull()
      .default(sql`0`),
  },
  (t) => [
    check("customers_type_check", oneOf(t.type, CUSTOMER_TYPES)),
    check("customers_price_tier_check", oneOf(t.priceTier, PRICE_TIERS)),
    check("customers_credit_limit_check", nonNegative(t.creditLimit)),
    check("customers_opening_due_check", nonNegative(t.openingDue)),
    check("customers_due_balance_check", nonNegative(t.dueBalance)),
  ],
);

/** A debit raises what the customer owes, a credit lowers it; seq gives the order of the running balance. */
export const customerLedger = pgTable(
  "customer_ledger",
  {
    ...commonColumns(),
    seq: bigint("seq", { mode: "bigint" }).generatedAlwaysAsIdentity(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
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
    check("customer_ledger_entry_type_check", oneOf(t.entryType, CUSTOMER_LEDGER_ENTRIES)),
    check("customer_ledger_debit_check", nonNegative(t.debit)),
    check("customer_ledger_credit_check", nonNegative(t.credit)),
    check("customer_ledger_one_side_check", sql`(${t.debit} > 0) <> (${t.credit} > 0)`),
    index("customer_ledger_customer_id_created_at_idx").on(t.customerId, t.createdAt),
  ],
);

export const sales = pgTable(
  "sales",
  {
    ...commonColumns(),
    invoiceNo: text("invoice_no").notNull().unique(),
    deviceId: uuid("device_id").references(() => devices.id),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id),
    customerId: uuid("customer_id").references(() => customers.id), // null = walk-in
    saleTime: timestamptz("sale_time").notNull(),
    subtotal: money("subtotal").notNull(),
    discount: money("discount").notNull(),
    total: money("total").notNull(),
    paid: money("paid").notNull(),
    due: money("due").notNull(),
    roundOff: money("round_off").notNull(), // signed
    status: text("status").notNull().default("completed"),
    voidReason: text("void_reason"),
    voidedAt: timestamptz("voided_at"),
    flags: text("flags")
      .array()
      .notNull()
      .default(sql`'{}'`), // warnings accepted at sale time
    note: text("note"),
  },
  (t) => [
    check("sales_status_check", oneOf(t.status, SALE_STATUSES)),
    check("sales_subtotal_check", nonNegative(t.subtotal)),
    check("sales_discount_check", nonNegative(t.discount)),
    check("sales_total_check", nonNegative(t.total)),
    check("sales_paid_check", nonNegative(t.paid)),
    check("sales_due_check", nonNegative(t.due)),
    check("sales_total_formula_check", sql`${t.total} = ${t.subtotal} - ${t.discount} + ${t.roundOff}`),
    check("sales_due_formula_check", sql`${t.due} = ${t.total} - ${t.paid}`),
    index("sales_customer_id_sale_time_idx").on(t.customerId, t.saleTime.desc()),
    index("sales_device_id_idx").on(t.deviceId),
    index("sales_api_key_id_idx").on(t.apiKeyId),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    ...commonColumns(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    partId: uuid("part_id")
      .notNull()
      .references(() => parts.id),
    quantity: quantity("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    listPrice: money("list_price").notNull(),
    lineTotal: money("line_total").notNull(),
    unitCostAtSale: money("unit_cost_at_sale").notNull(),
    priceTier: text("price_tier").notNull(),
  },
  (t) => [
    check("sale_items_quantity_check", positive(t.quantity)),
    check("sale_items_unit_price_check", nonNegative(t.unitPrice)),
    check("sale_items_list_price_check", nonNegative(t.listPrice)),
    check("sale_items_line_total_check", nonNegative(t.lineTotal)),
    check("sale_items_unit_cost_at_sale_check", nonNegative(t.unitCostAtSale)),
    check("sale_items_price_tier_check", oneOf(t.priceTier, PRICE_TIERS)),
    index("sale_items_sale_id_idx").on(t.saleId),
    index("sale_items_part_id_idx").on(t.partId),
  ],
);

export const salePayments = pgTable(
  "sale_payments",
  {
    ...commonColumns(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    accountId: uuid("account_id").references(() => accounts.id), // null for a cheque
    method: text("method").notNull(),
    amount: money("amount").notNull(),
    trxId: text("trx_id"),
    chequeId: uuid("cheque_id").references(() => cheques.id),
  },
  (t) => [
    check("sale_payments_method_check", oneOf(t.method, PAYMENT_METHODS)),
    check("sale_payments_amount_check", positive(t.amount)),
    index("sale_payments_sale_id_idx").on(t.saleId),
    index("sale_payments_account_id_idx").on(t.accountId),
    index("sale_payments_cheque_id_idx").on(t.chequeId),
  ],
);

export const customerPayments = pgTable(
  "customer_payments",
  {
    ...commonColumns(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    accountId: uuid("account_id").references(() => accounts.id),
    amount: money("amount").notNull(),
    method: text("method").notNull(),
    trxId: text("trx_id"),
    chequeId: uuid("cheque_id").references(() => cheques.id),
    receivedAt: timestamptz("received_at").notNull(),
    status: text("status").notNull().default("completed"),
    reversedAt: timestamptz("reversed_at"),
    reversalReason: text("reversal_reason"),
  },
  (t) => [
    check("customer_payments_amount_check", positive(t.amount)),
    check("customer_payments_method_check", oneOf(t.method, PAYMENT_METHODS)),
    check("customer_payments_status_check", oneOf(t.status, CUSTOMER_PAYMENT_STATUSES)),
    index("customer_payments_customer_id_idx").on(t.customerId),
    index("customer_payments_account_id_idx").on(t.accountId),
    index("customer_payments_cheque_id_idx").on(t.chequeId),
  ],
);

export const returns = pgTable(
  "returns",
  {
    ...commonColumns(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    customerId: uuid("customer_id").references(() => customers.id),
    returnTime: timestamptz("return_time").notNull(),
    total: money("total").notNull(),
    refundDue: money("refund_due")
      .notNull()
      .default(sql`0`),
    refundCash: money("refund_cash")
      .notNull()
      .default(sql`0`),
    accountId: uuid("account_id").references(() => accounts.id), // for the cash part
    reason: text("reason"),
  },
  (t) => [
    check("returns_total_check", nonNegative(t.total)),
    check("returns_refund_due_check", nonNegative(t.refundDue)),
    check("returns_refund_cash_check", nonNegative(t.refundCash)),
    check("returns_refund_sum_check", sql`${t.refundDue} + ${t.refundCash} = ${t.total}`),
    check("returns_cash_account_check", sql`${t.refundCash} = 0 or ${t.accountId} is not null`),
    index("returns_sale_id_idx").on(t.saleId),
    index("returns_customer_id_idx").on(t.customerId),
    index("returns_account_id_idx").on(t.accountId),
  ],
);

export const returnItems = pgTable(
  "return_items",
  {
    ...commonColumns(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => returns.id),
    saleItemId: uuid("sale_item_id")
      .notNull()
      .references(() => saleItems.id),
    partId: uuid("part_id")
      .notNull()
      .references(() => parts.id),
    quantity: quantity("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    restock: text("restock").notNull().default("yes"),
  },
  (t) => [
    check("return_items_quantity_check", positive(t.quantity)),
    check("return_items_unit_price_check", nonNegative(t.unitPrice)),
    check("return_items_restock_check", oneOf(t.restock, RESTOCK_OPTIONS)),
    index("return_items_return_id_idx").on(t.returnId),
    index("return_items_sale_item_id_idx").on(t.saleItemId),
    index("return_items_part_id_idx").on(t.partId),
  ],
);
