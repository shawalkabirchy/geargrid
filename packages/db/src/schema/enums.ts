// Every enumeration of spec 5.2, kept as text with a CHECK constraint so a new value is one simple migration.

export const LANGUAGES = ["bn", "en"] as const;
export const USER_ROLES = ["owner", "staff"] as const;
export const USER_STATUSES = ["active", "disabled"] as const;
export const DEVICE_PLATFORMS = ["android", "ios", "web"] as const;
export const AUDIT_SOURCES = ["api", "ai"] as const;
export const INVOICE_COUNTER_PREFIXES = ["W", "A"] as const;

export const PART_VEHICLE_TYPES = ["car", "motorcycle", "both"] as const;
export const PART_QUALITIES = ["genuine", "aftermarket", "reconditioned", "used"] as const;
export const PART_POSITIONS = ["front", "rear", "left", "right"] as const;
export const PART_UNITS = ["piece", "set", "pair", "liter", "box"] as const;
export const PART_NUMBER_KINDS = ["oem", "aftermarket", "supplier"] as const;
export const VEHICLE_TYPES = ["car", "microbus", "motorcycle"] as const;
export const VEHICLE_SOURCES = ["starter", "shop"] as const;
export const FITMENT_SOURCES = ["excel", "catalog", "owner", "ai"] as const;

export const STOCK_MOVEMENT_REASONS = [
  "sale",
  "return",
  "purchase",
  "void",
  "adjustment",
  "opening",
  "purchase_reversal",
] as const;
export const STOCK_ADJUSTMENT_REASONS = ["count", "damage", "lost", "found"] as const;

export const CUSTOMER_TYPES = ["retail", "garage", "wholesale"] as const;
export const PRICE_TIERS = ["retail", "garage", "wholesale"] as const;
export const CUSTOMER_LEDGER_ENTRIES = [
  "opening",
  "sale",
  "sale_payment",
  "payment",
  "return",
  "void",
  "void_payment",
  "payment_reversal",
  "cheque_bounce",
] as const;
export const SALE_STATUSES = ["completed", "void"] as const;
export const PAYMENT_METHODS = ["cash", "bkash", "nagad", "rocket", "bank", "cheque"] as const;
export const CUSTOMER_PAYMENT_STATUSES = ["completed", "reversed"] as const;
export const RESTOCK_OPTIONS = ["yes", "damaged"] as const;

export const SUPPLIER_LEDGER_ENTRIES = [
  "opening",
  "purchase",
  "purchase_payment",
  "payment",
  "purchase_reversal",
  "payment_reversal",
] as const;
export const PURCHASE_STATUSES = ["completed", "reversed"] as const;

export const ACCOUNT_KINDS = ["cash", "bkash", "nagad", "rocket", "bank"] as const;
export const ACCOUNT_DIRECTIONS = ["in", "out"] as const;
export const CHEQUE_DIRECTIONS = ["received", "issued"] as const;
export const CHEQUE_PARTY_TYPES = ["customer", "supplier"] as const;
export const CHEQUE_STATUSES = ["pending", "deposited", "cleared", "bounced", "cancelled"] as const;

export const AUDIT_LOG_SOURCES = ["mobile", "web", "api", "ai"] as const;
export const CHANGE_LOG_OPS = ["upsert", "delete"] as const;
export const SYNC_COMMAND_STATUSES = ["applied", "duplicate", "rejected"] as const;

/** Scopes of GearGrid API keys (spec 6.2). */
export const API_SCOPES = [
  "read",
  "sales:write",
  "payments:write",
  "purchases:write",
  "returns:write",
  "prices:write",
  "fitments:write",
] as const;
