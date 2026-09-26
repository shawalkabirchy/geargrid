import { sql, type SQL } from "drizzle-orm";
import { bigint, integer, numeric, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

// Shared column shapes and constraint helpers (spec 5.1).

/** Money: bigint paisa, read and written as a JS bigint. */
export const money = (name: string) => bigint(name, { mode: "bigint" });

/** Quantities: numeric(12,3), read as text such as "3.000" (parse with parseQuantity). */
export const quantity = (name: string) => numeric(name, { precision: 12, scale: 3 });

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/** id, created_at, updated_at, deleted_at (soft delete) and version, on every business table. */
export function commonColumns() {
  return {
    id: uuid("id").primaryKey(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    deletedAt: timestamptz("deleted_at"),
    version: integer("version").notNull().default(1),
  };
}

/** column IN ('a', 'b', ...) for an enumeration kept as text. The values are constants, never user input. */
export function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;
}

export const nonNegative = (column: AnyPgColumn): SQL => sql`${column} >= 0`;
export const positive = (column: AnyPgColumn): SQL => sql`${column} > 0`;
export const notZero = (column: AnyPgColumn): SQL => sql`${column} <> 0`;
