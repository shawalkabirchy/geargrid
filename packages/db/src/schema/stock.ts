import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { commonColumns, money, nonNegative, notZero, oneOf, quantity, timestamptz } from "./columns";
import { parts } from "./catalog";
import { STOCK_ADJUSTMENT_REASONS, STOCK_MOVEMENT_REASONS } from "./enums";

// Stock (spec 5.2). The stock level may go negative: a sale is never refused for stock.

export const stockLevels = pgTable("stock_levels", {
  partId: uuid("part_id")
    .primaryKey()
    .references(() => parts.id),
  quantity: quantity("quantity").notNull().default("0"),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const stockMovements = pgTable(
  "stock_movements",
  {
    ...commonColumns(),
    partId: uuid("part_id")
      .notNull()
      .references(() => parts.id),
    qtyChange: quantity("qty_change").notNull(),
    reason: text("reason").notNull(),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    unitCost: money("unit_cost"),
  },
  (t) => [
    check("stock_movements_qty_change_check", notZero(t.qtyChange)),
    check("stock_movements_reason_check", oneOf(t.reason, STOCK_MOVEMENT_REASONS)),
    check("stock_movements_unit_cost_check", nonNegative(t.unitCost)),
    index("stock_movements_part_id_created_at_idx").on(t.partId, t.createdAt),
  ],
);

export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    ...commonColumns(),
    partId: uuid("part_id")
      .notNull()
      .references(() => parts.id),
    qtyChange: quantity("qty_change").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
  },
  (t) => [
    check("stock_adjustments_qty_change_check", notZero(t.qtyChange)),
    check("stock_adjustments_reason_check", oneOf(t.reason, STOCK_ADJUSTMENT_REASONS)),
    index("stock_adjustments_part_id_idx").on(t.partId),
  ],
);
