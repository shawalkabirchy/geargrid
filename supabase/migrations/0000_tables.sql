CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "brands_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name_en" text NOT NULL,
	"name_bn" text,
	"parent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "fitments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"part_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"note" text,
	"source" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "fitments_source_check" CHECK ("fitments"."source" in ('excel', 'catalog', 'owner', 'ai'))
);
--> statement-breakpoint
CREATE TABLE "part_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"part_id" uuid,
	"category_id" uuid,
	"alias_text" text NOT NULL,
	CONSTRAINT "part_aliases_one_target_check" CHECK (("part_aliases"."part_id" is null) <> ("part_aliases"."category_id" is null))
);
--> statement-breakpoint
CREATE TABLE "part_numbers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"part_id" uuid NOT NULL,
	"number" text NOT NULL,
	"number_normalized" text NOT NULL,
	"kind" text NOT NULL,
	"brand" text,
	"is_main" boolean DEFAULT false NOT NULL,
	CONSTRAINT "part_numbers_kind_check" CHECK ("part_numbers"."kind" in ('oem', 'aftermarket', 'supplier'))
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name_en" text NOT NULL,
	"name_bn" text,
	"category_id" uuid NOT NULL,
	"brand_id" uuid,
	"vehicle_type" text NOT NULL,
	"quality" text NOT NULL,
	"position" text,
	"unit" text NOT NULL,
	"pack_size" numeric(12, 3),
	"rack_location" text,
	"retail_price" bigint NOT NULL,
	"garage_price" bigint,
	"wholesale_price" bigint,
	"avg_cost" bigint DEFAULT 0 NOT NULL,
	"reorder_level" numeric(12, 3) DEFAULT '0' NOT NULL,
	"photo_path" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "parts_vehicle_type_check" CHECK ("parts"."vehicle_type" in ('car', 'motorcycle', 'both')),
	CONSTRAINT "parts_quality_check" CHECK ("parts"."quality" in ('genuine', 'aftermarket', 'reconditioned', 'used')),
	CONSTRAINT "parts_position_check" CHECK ("parts"."position" in ('front', 'rear', 'left', 'right')),
	CONSTRAINT "parts_unit_check" CHECK ("parts"."unit" in ('piece', 'set', 'pair', 'liter', 'box')),
	CONSTRAINT "parts_retail_price_check" CHECK ("parts"."retail_price" >= 0),
	CONSTRAINT "parts_garage_price_check" CHECK ("parts"."garage_price" >= 0),
	CONSTRAINT "parts_wholesale_price_check" CHECK ("parts"."wholesale_price" >= 0),
	CONSTRAINT "parts_avg_cost_check" CHECK ("parts"."avg_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"vehicle_type" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year_from" smallint NOT NULL,
	"year_to" smallint,
	"engine_code" text,
	"body" text,
	"source" text NOT NULL,
	CONSTRAINT "vehicles_vehicle_type_check" CHECK ("vehicles"."vehicle_type" in ('car', 'microbus', 'motorcycle')),
	CONSTRAINT "vehicles_source_check" CHECK ("vehicles"."source" in ('starter', 'shop')),
	CONSTRAINT "vehicles_years_check" CHECK ("vehicles"."year_to" is null or "vehicles"."year_to" >= "vehicles"."year_from")
);
--> statement-breakpoint
CREATE TABLE "account_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"amount" bigint NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" uuid,
	"note" text,
	CONSTRAINT "account_transactions_direction_check" CHECK ("account_transactions"."direction" in ('in', 'out')),
	CONSTRAINT "account_transactions_amount_check" CHECK ("account_transactions"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"number" text,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "accounts_kind_check" CHECK ("accounts"."kind" in ('cash', 'bkash', 'nagad', 'rocket', 'bank')),
	CONSTRAINT "accounts_opening_balance_check" CHECK ("accounts"."opening_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cheques" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"direction" text NOT NULL,
	"party_type" text NOT NULL,
	"party_id" uuid NOT NULL,
	"bank" text NOT NULL,
	"cheque_no" text NOT NULL,
	"amount" bigint NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "cheques_direction_check" CHECK ("cheques"."direction" in ('received', 'issued')),
	CONSTRAINT "cheques_party_type_check" CHECK ("cheques"."party_type" in ('customer', 'supplier')),
	CONSTRAINT "cheques_amount_check" CHECK ("cheques"."amount" > 0),
	CONSTRAINT "cheques_status_check" CHECK ("cheques"."status" in ('pending', 'deposited', 'cleared', 'bounced', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "daily_closings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"date" date NOT NULL,
	"account_id" uuid NOT NULL,
	"expected_balance" bigint NOT NULL,
	"counted_balance" bigint NOT NULL,
	"difference" bigint NOT NULL,
	CONSTRAINT "daily_closings_date_account_unique" UNIQUE("date","account_id"),
	CONSTRAINT "daily_closings_expected_balance_check" CHECK ("daily_closings"."expected_balance" >= 0),
	CONSTRAINT "daily_closings_counted_balance_check" CHECK ("daily_closings"."counted_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name_en" text NOT NULL,
	"name_bn" text
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"category_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"note" text,
	"spent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "expenses_amount_check" CHECK ("expenses"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"purchase_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_cost" bigint NOT NULL,
	"line_total" bigint NOT NULL,
	CONSTRAINT "purchase_items_quantity_check" CHECK ("purchase_items"."quantity" > 0),
	CONSTRAINT "purchase_items_unit_cost_check" CHECK ("purchase_items"."unit_cost" >= 0),
	CONSTRAINT "purchase_items_line_total_check" CHECK ("purchase_items"."line_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"supplier_id" uuid NOT NULL,
	"bill_no" text,
	"purchase_time" timestamp with time zone NOT NULL,
	"total" bigint NOT NULL,
	"paid" bigint NOT NULL,
	"due" bigint NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	CONSTRAINT "purchases_total_check" CHECK ("purchases"."total" >= 0),
	CONSTRAINT "purchases_paid_check" CHECK ("purchases"."paid" >= 0),
	CONSTRAINT "purchases_due_check" CHECK ("purchases"."due" >= 0),
	CONSTRAINT "purchases_status_check" CHECK ("purchases"."status" in ('completed', 'reversed'))
);
--> statement-breakpoint
CREATE TABLE "supplier_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "supplier_ledger_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"supplier_id" uuid NOT NULL,
	"entry_type" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"debit" bigint DEFAULT 0 NOT NULL,
	"credit" bigint DEFAULT 0 NOT NULL,
	"balance_after" bigint NOT NULL,
	CONSTRAINT "supplier_ledger_entry_type_check" CHECK ("supplier_ledger"."entry_type" in ('opening', 'purchase', 'purchase_payment', 'payment', 'purchase_reversal', 'payment_reversal')),
	CONSTRAINT "supplier_ledger_debit_check" CHECK ("supplier_ledger"."debit" >= 0),
	CONSTRAINT "supplier_ledger_credit_check" CHECK ("supplier_ledger"."credit" >= 0),
	CONSTRAINT "supplier_ledger_one_side_check" CHECK (("supplier_ledger"."debit" > 0) <> ("supplier_ledger"."credit" > 0))
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_id" uuid,
	"account_id" uuid,
	"amount" bigint NOT NULL,
	"method" text NOT NULL,
	"trx_id" text,
	"cheque_id" uuid,
	"paid_at" timestamp with time zone NOT NULL,
	CONSTRAINT "supplier_payments_amount_check" CHECK ("supplier_payments"."amount" > 0),
	CONSTRAINT "supplier_payments_method_check" CHECK ("supplier_payments"."method" in ('cash', 'bkash', 'nagad', 'rocket', 'bank', 'cheque'))
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"address" text,
	"opening_payable" bigint DEFAULT 0 NOT NULL,
	"payable_balance" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "suppliers_opening_payable_check" CHECK ("suppliers"."opening_payable" >= 0),
	CONSTRAINT "suppliers_payable_balance_check" CHECK ("suppliers"."payable_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customer_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "customer_ledger_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_id" uuid NOT NULL,
	"entry_type" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"debit" bigint DEFAULT 0 NOT NULL,
	"credit" bigint DEFAULT 0 NOT NULL,
	"balance_after" bigint NOT NULL,
	CONSTRAINT "customer_ledger_entry_type_check" CHECK ("customer_ledger"."entry_type" in ('opening', 'sale', 'sale_payment', 'payment', 'return', 'void', 'void_payment', 'payment_reversal', 'cheque_bounce')),
	CONSTRAINT "customer_ledger_debit_check" CHECK ("customer_ledger"."debit" >= 0),
	CONSTRAINT "customer_ledger_credit_check" CHECK ("customer_ledger"."credit" >= 0),
	CONSTRAINT "customer_ledger_one_side_check" CHECK (("customer_ledger"."debit" > 0) <> ("customer_ledger"."credit" > 0))
);
--> statement-breakpoint
CREATE TABLE "customer_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"customer_id" uuid NOT NULL,
	"account_id" uuid,
	"amount" bigint NOT NULL,
	"method" text NOT NULL,
	"trx_id" text,
	"cheque_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	CONSTRAINT "customer_payments_amount_check" CHECK ("customer_payments"."amount" > 0),
	CONSTRAINT "customer_payments_method_check" CHECK ("customer_payments"."method" in ('cash', 'bkash', 'nagad', 'rocket', 'bank', 'cheque')),
	CONSTRAINT "customer_payments_status_check" CHECK ("customer_payments"."status" in ('completed', 'reversed'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"price_tier" text NOT NULL,
	"phone" text,
	"address" text,
	"credit_limit" bigint,
	"opening_due" bigint DEFAULT 0 NOT NULL,
	"due_balance" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "customers_type_check" CHECK ("customers"."type" in ('retail', 'garage', 'wholesale')),
	CONSTRAINT "customers_price_tier_check" CHECK ("customers"."price_tier" in ('retail', 'garage', 'wholesale')),
	CONSTRAINT "customers_credit_limit_check" CHECK ("customers"."credit_limit" >= 0),
	CONSTRAINT "customers_opening_due_check" CHECK ("customers"."opening_due" >= 0),
	CONSTRAINT "customers_due_balance_check" CHECK ("customers"."due_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "return_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"return_id" uuid NOT NULL,
	"sale_item_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" bigint NOT NULL,
	"restock" text DEFAULT 'yes' NOT NULL,
	CONSTRAINT "return_items_quantity_check" CHECK ("return_items"."quantity" > 0),
	CONSTRAINT "return_items_unit_price_check" CHECK ("return_items"."unit_price" >= 0),
	CONSTRAINT "return_items_restock_check" CHECK ("return_items"."restock" in ('yes', 'damaged'))
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"sale_id" uuid NOT NULL,
	"customer_id" uuid,
	"return_time" timestamp with time zone NOT NULL,
	"total" bigint NOT NULL,
	"refund_due" bigint DEFAULT 0 NOT NULL,
	"refund_cash" bigint DEFAULT 0 NOT NULL,
	"account_id" uuid,
	"reason" text,
	CONSTRAINT "returns_total_check" CHECK ("returns"."total" >= 0),
	CONSTRAINT "returns_refund_due_check" CHECK ("returns"."refund_due" >= 0),
	CONSTRAINT "returns_refund_cash_check" CHECK ("returns"."refund_cash" >= 0),
	CONSTRAINT "returns_refund_sum_check" CHECK ("returns"."refund_due" + "returns"."refund_cash" = "returns"."total"),
	CONSTRAINT "returns_cash_account_check" CHECK ("returns"."refund_cash" = 0 or "returns"."account_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"sale_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" bigint NOT NULL,
	"list_price" bigint NOT NULL,
	"line_total" bigint NOT NULL,
	"unit_cost_at_sale" bigint NOT NULL,
	"price_tier" text NOT NULL,
	CONSTRAINT "sale_items_quantity_check" CHECK ("sale_items"."quantity" > 0),
	CONSTRAINT "sale_items_unit_price_check" CHECK ("sale_items"."unit_price" >= 0),
	CONSTRAINT "sale_items_list_price_check" CHECK ("sale_items"."list_price" >= 0),
	CONSTRAINT "sale_items_line_total_check" CHECK ("sale_items"."line_total" >= 0),
	CONSTRAINT "sale_items_unit_cost_at_sale_check" CHECK ("sale_items"."unit_cost_at_sale" >= 0),
	CONSTRAINT "sale_items_price_tier_check" CHECK ("sale_items"."price_tier" in ('retail', 'garage', 'wholesale'))
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"sale_id" uuid NOT NULL,
	"account_id" uuid,
	"method" text NOT NULL,
	"amount" bigint NOT NULL,
	"trx_id" text,
	"cheque_id" uuid,
	CONSTRAINT "sale_payments_method_check" CHECK ("sale_payments"."method" in ('cash', 'bkash', 'nagad', 'rocket', 'bank', 'cheque')),
	CONSTRAINT "sale_payments_amount_check" CHECK ("sale_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"invoice_no" text NOT NULL,
	"device_id" uuid,
	"api_key_id" uuid,
	"customer_id" uuid,
	"sale_time" timestamp with time zone NOT NULL,
	"subtotal" bigint NOT NULL,
	"discount" bigint NOT NULL,
	"total" bigint NOT NULL,
	"paid" bigint NOT NULL,
	"due" bigint NOT NULL,
	"round_off" bigint NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"flags" text[] DEFAULT '{}' NOT NULL,
	"note" text,
	CONSTRAINT "sales_invoice_no_unique" UNIQUE("invoice_no"),
	CONSTRAINT "sales_status_check" CHECK ("sales"."status" in ('completed', 'void')),
	CONSTRAINT "sales_subtotal_check" CHECK ("sales"."subtotal" >= 0),
	CONSTRAINT "sales_discount_check" CHECK ("sales"."discount" >= 0),
	CONSTRAINT "sales_total_check" CHECK ("sales"."total" >= 0),
	CONSTRAINT "sales_paid_check" CHECK ("sales"."paid" >= 0),
	CONSTRAINT "sales_due_check" CHECK ("sales"."due" >= 0),
	CONSTRAINT "sales_total_formula_check" CHECK ("sales"."total" = "sales"."subtotal" - "sales"."discount" + "sales"."round_off"),
	CONSTRAINT "sales_due_formula_check" CHECK ("sales"."due" = "sales"."total" - "sales"."paid")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"audit_source" text DEFAULT 'api' NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash"),
	CONSTRAINT "api_keys_audit_source_check" CHECK ("api_keys"."audit_source" in ('api', 'ai'))
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"user_id" uuid,
	"device_code" text NOT NULL,
	"platform" text NOT NULL,
	"app_version" text,
	"last_sync_at" timestamp with time zone,
	"pending_commands" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_device_code_unique" UNIQUE("device_code"),
	CONSTRAINT "devices_platform_check" CHECK ("devices"."platform" in ('android', 'ios', 'web'))
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"prefix" text PRIMARY KEY NOT NULL,
	"last_sequence" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_counters_prefix_check" CHECK ("invoice_counters"."prefix" in ('W', 'A')),
	CONSTRAINT "invoice_counters_last_sequence_check" CHECK ("invoice_counters"."last_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY NOT NULL,
	"shop_name" text NOT NULL,
	"market_area" text,
	"phone" text,
	"address" text,
	"logo_path" text,
	"language" text DEFAULT 'bn' NOT NULL,
	"bangla_digits" boolean DEFAULT true NOT NULL,
	"round_off_rule" smallint DEFAULT 1 NOT NULL,
	"default_credit_limit" bigint,
	"default_reorder_level" numeric(12, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_id_check" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_language_check" CHECK ("settings"."language" in ('bn', 'en')),
	CONSTRAINT "settings_round_off_rule_check" CHECK ("settings"."round_off_rule" in (1, 5, 10)),
	CONSTRAINT "settings_default_credit_limit_check" CHECK ("settings"."default_credit_limit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('owner', 'staff')),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"part_id" uuid NOT NULL,
	"qty_change" numeric(12, 3) NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	CONSTRAINT "stock_adjustments_qty_change_check" CHECK ("stock_adjustments"."qty_change" <> 0),
	CONSTRAINT "stock_adjustments_reason_check" CHECK ("stock_adjustments"."reason" in ('count', 'damage', 'lost', 'found'))
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"part_id" uuid PRIMARY KEY NOT NULL,
	"quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"part_id" uuid NOT NULL,
	"qty_change" numeric(12, 3) NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"unit_cost" bigint,
	CONSTRAINT "stock_movements_qty_change_check" CHECK ("stock_movements"."qty_change" <> 0),
	CONSTRAINT "stock_movements_reason_check" CHECK ("stock_movements"."reason" in ('sale', 'return', 'purchase', 'void', 'adjustment', 'opening', 'purchase_reversal')),
	CONSTRAINT "stock_movements_unit_cost_check" CHECK ("stock_movements"."unit_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"api_key_id" uuid,
	"device_id" uuid,
	"source" text NOT NULL,
	"acting_user" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_source_check" CHECK ("audit_logs"."source" in ('mobile', 'web', 'api', 'ai'))
);
--> statement-breakpoint
CREATE TABLE "change_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"op" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_log_op_check" CHECK ("change_log"."op" in ('upsert', 'delete'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" smallint,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_key_scope_pk" PRIMARY KEY("key","scope")
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"file_path" text,
	"status" text NOT NULL,
	"rows_ok" integer,
	"rows_failed" integer,
	"report" jsonb
);
--> statement-breakpoint
CREATE TABLE "sync_commands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_commands_status_check" CHECK ("sync_commands"."status" in ('applied', 'duplicate', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitments" ADD CONSTRAINT "fitments_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fitments" ADD CONSTRAINT "fitments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_aliases" ADD CONSTRAINT "part_aliases_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_aliases" ADD CONSTRAINT "part_aliases_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_numbers" ADD CONSTRAINT "part_numbers_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_closings" ADD CONSTRAINT "daily_closings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ledger" ADD CONSTRAINT "supplier_ledger_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cheque_id_cheques_id_fk" FOREIGN KEY ("cheque_id") REFERENCES "public"."cheques"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_ledger" ADD CONSTRAINT "customer_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_cheque_id_cheques_id_fk" FOREIGN KEY ("cheque_id") REFERENCES "public"."cheques"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_cheque_id_cheques_id_fk" FOREIGN KEY ("cheque_id") REFERENCES "public"."cheques"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_commands" ADD CONSTRAINT "sync_commands_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fitments_part_vehicle_idx" ON "fitments" USING btree ("part_id","vehicle_id") WHERE "fitments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "fitments_part_id_idx" ON "fitments" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "fitments_vehicle_id_idx" ON "fitments" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "part_aliases_part_id_idx" ON "part_aliases" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "part_aliases_category_id_idx" ON "part_aliases" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "part_numbers_part_id_idx" ON "part_numbers" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "part_numbers_number_normalized_idx" ON "part_numbers" USING btree ("number_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "part_numbers_one_main_idx" ON "part_numbers" USING btree ("part_id") WHERE "part_numbers"."is_main" and "part_numbers"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "parts_category_id_idx" ON "parts" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "parts_brand_id_idx" ON "parts" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "vehicles_lower_model_idx" ON "vehicles" USING btree (lower("model"));--> statement-breakpoint
CREATE INDEX "account_transactions_account_id_idx" ON "account_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "daily_closings_account_id_idx" ON "daily_closings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "expenses_category_id_idx" ON "expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "expenses_account_id_idx" ON "expenses" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_items_part_id_idx" ON "purchase_items" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "purchases_supplier_id_idx" ON "purchases" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_ledger_supplier_id_created_at_idx" ON "supplier_ledger" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_id_idx" ON "supplier_payments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_purchase_id_idx" ON "supplier_payments" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_account_id_idx" ON "supplier_payments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_cheque_id_idx" ON "supplier_payments" USING btree ("cheque_id");--> statement-breakpoint
CREATE INDEX "customer_ledger_customer_id_created_at_idx" ON "customer_ledger" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_payments_customer_id_idx" ON "customer_payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_payments_account_id_idx" ON "customer_payments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "customer_payments_cheque_id_idx" ON "customer_payments" USING btree ("cheque_id");--> statement-breakpoint
CREATE INDEX "return_items_return_id_idx" ON "return_items" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "return_items_sale_item_id_idx" ON "return_items" USING btree ("sale_item_id");--> statement-breakpoint
CREATE INDEX "return_items_part_id_idx" ON "return_items" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "returns_sale_id_idx" ON "returns" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "returns_customer_id_idx" ON "returns" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "returns_account_id_idx" ON "returns" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_part_id_idx" ON "sale_items" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_payments_account_id_idx" ON "sale_payments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sale_payments_cheque_id_idx" ON "sale_payments" USING btree ("cheque_id");--> statement-breakpoint
CREATE INDEX "sales_customer_id_sale_time_idx" ON "sales" USING btree ("customer_id","sale_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sales_device_id_idx" ON "sales" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "sales_api_key_id_idx" ON "sales" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "devices_user_id_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_adjustments_part_id_idx" ON "stock_adjustments" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "stock_movements_part_id_created_at_idx" ON "stock_movements" USING btree ("part_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sync_commands_device_id_idx" ON "sync_commands" USING btree ("device_id");