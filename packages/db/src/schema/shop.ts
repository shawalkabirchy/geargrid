import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";
import { commonColumns, money, nonNegative, oneOf, quantity, timestamptz } from "./columns";
import {
  AUDIT_SOURCES,
  DEVICE_PLATFORMS,
  INVOICE_COUNTER_PREFIXES,
  LANGUAGES,
  USER_ROLES,
  USER_STATUSES,
} from "./enums";

// Shop, users, devices (spec 5.2).

export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey(),
    shopName: text("shop_name").notNull(),
    marketArea: text("market_area"),
    phone: text("phone"),
    address: text("address"),
    logoPath: text("logo_path"),
    language: text("language").notNull().default("bn"),
    banglaDigits: boolean("bangla_digits").notNull().default(true),
    roundOffRule: smallint("round_off_rule").notNull().default(1),
    defaultCreditLimit: money("default_credit_limit"),
    defaultReorderLevel: quantity("default_reorder_level").notNull().default("0"),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("settings_id_check", sql`${t.id} = 1`),
    check("settings_language_check", oneOf(t.language, LANGUAGES)),
    check("settings_round_off_rule_check", sql`${t.roundOffRule} in (1, 5, 10)`),
    check("settings_default_credit_limit_check", nonNegative(t.defaultCreditLimit)),
  ],
);

export const users = pgTable(
  "users",
  {
    ...commonColumns(),
    authUserId: uuid("auth_user_id").notNull().unique(), // no FK to auth.users
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    role: text("role").notNull(),
    status: text("status").notNull().default("active"),
  },
  (t) => [
    check("users_role_check", oneOf(t.role, USER_ROLES)),
    check("users_status_check", oneOf(t.status, USER_STATUSES)),
  ],
);

export const devices = pgTable(
  "devices",
  {
    ...commonColumns(),
    userId: uuid("user_id").references(() => users.id),
    deviceCode: text("device_code").notNull().unique(),
    platform: text("platform").notNull(),
    appVersion: text("app_version"),
    lastSyncAt: timestamptz("last_sync_at"),
    pendingCommands: integer("pending_commands").notNull().default(0),
    revokedAt: timestamptz("revoked_at"),
  },
  (t) => [
    check("devices_platform_check", oneOf(t.platform, DEVICE_PLATFORMS)),
    index("devices_user_id_idx").on(t.userId),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    ...commonColumns(),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(), // SHA-256 hex; the key itself is never stored
    scopes: text("scopes").array().notNull(),
    auditSource: text("audit_source").notNull().default("api"),
    lastUsedAt: timestamptz("last_used_at"),
    revokedAt: timestamptz("revoked_at"),
  },
  (t) => [check("api_keys_audit_source_check", oneOf(t.auditSource, AUDIT_SOURCES))],
);

/** Invoice counters for W- and A- numbers: a row lock in the sale's transaction, so a dry run never uses a number. */
export const invoiceCounters = pgTable(
  "invoice_counters",
  {
    prefix: text("prefix").primaryKey(),
    lastSequence: bigint("last_sequence", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
  },
  (t) => [
    check("invoice_counters_prefix_check", oneOf(t.prefix, INVOICE_COUNTER_PREFIXES)),
    check("invoice_counters_last_sequence_check", nonNegative(t.lastSequence)),
  ],
);
