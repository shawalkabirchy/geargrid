import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { commonColumns, money, nonNegative, oneOf, quantity } from "./columns";
import {
  FITMENT_SOURCES,
  PART_NUMBER_KINDS,
  PART_POSITIONS,
  PART_QUALITIES,
  PART_UNITS,
  PART_VEHICLE_TYPES,
  VEHICLE_SOURCES,
  VEHICLE_TYPES,
} from "./enums";

// Catalog and fitment (spec 5.2).

export const categories = pgTable(
  "categories",
  {
    ...commonColumns(),
    nameEn: text("name_en").notNull(),
    nameBn: text("name_bn"),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
  },
  (t) => [index("categories_parent_id_idx").on(t.parentId)],
);

export const brands = pgTable("brands", {
  ...commonColumns(),
  name: text("name").notNull().unique(),
});

export const parts = pgTable(
  "parts",
  {
    ...commonColumns(),
    nameEn: text("name_en").notNull(),
    nameBn: text("name_bn"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    brandId: uuid("brand_id").references(() => brands.id),
    vehicleType: text("vehicle_type").notNull(), // car covers microbus parts
    quality: text("quality").notNull(),
    position: text("position"),
    unit: text("unit").notNull(),
    packSize: quantity("pack_size"),
    rackLocation: text("rack_location"),
    retailPrice: money("retail_price").notNull(),
    garagePrice: money("garage_price"), // the paikari price (D144); null = retail is used
    avgCost: money("avg_cost")
      .notNull()
      .default(sql`0`),
    reorderLevel: quantity("reorder_level").notNull().default("0"),
    photoPath: text("photo_path"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    check("parts_vehicle_type_check", oneOf(t.vehicleType, PART_VEHICLE_TYPES)),
    check("parts_quality_check", oneOf(t.quality, PART_QUALITIES)),
    check("parts_position_check", oneOf(t.position, PART_POSITIONS)),
    check("parts_unit_check", oneOf(t.unit, PART_UNITS)),
    check("parts_retail_price_check", nonNegative(t.retailPrice)),
    check("parts_garage_price_check", nonNegative(t.garagePrice)),
    check("parts_avg_cost_check", nonNegative(t.avgCost)),
    index("parts_category_id_idx").on(t.categoryId),
    index("parts_brand_id_idx").on(t.brandId),
  ],
);

export const partNumbers = pgTable(
  "part_numbers",
  {
    ...commonColumns(),
    partId: uuid("part_id")
      .notNull()
      .references(() => parts.id),
    number: text("number").notNull(),
    numberNormalized: text("number_normalized").notNull(), // upper case, no spaces or dashes
    kind: text("kind").notNull(),
    brand: text("brand"),
    isMain: boolean("is_main").notNull().default(false),
  },
  (t) => [
    check("part_numbers_kind_check", oneOf(t.kind, PART_NUMBER_KINDS)),
    index("part_numbers_part_id_idx").on(t.partId),
    index("part_numbers_number_normalized_idx").on(t.numberNormalized),
    uniqueIndex("part_numbers_one_main_idx")
      .on(t.partId)
      .where(sql`${t.isMain} and ${t.deletedAt} is null`),
  ],
);

export const partAliases = pgTable(
  "part_aliases",
  {
    ...commonColumns(),
    partId: uuid("part_id").references(() => parts.id),
    categoryId: uuid("category_id").references(() => categories.id),
    aliasText: text("alias_text").notNull(),
  },
  (t) => [
    check("part_aliases_one_target_check", sql`(${t.partId} is null) <> (${t.categoryId} is null)`),
    index("part_aliases_part_id_idx").on(t.partId),
    index("part_aliases_category_id_idx").on(t.categoryId),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    ...commonColumns(),
    vehicleType: text("vehicle_type").notNull(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    yearFrom: smallint("year_from").notNull(),
    yearTo: smallint("year_to"), // null = still made
    engineCode: text("engine_code"),
    body: text("body"),
    source: text("source").notNull(),
  },
  (t) => [
    check("vehicles_vehicle_type_check", oneOf(t.vehicleType, VEHICLE_TYPES)),
    check("vehicles_source_check", oneOf(t.source, VEHICLE_SOURCES)),
    check("vehicles_years_check", sql`${t.yearTo} is null or ${t.yearTo} >= ${t.yearFrom}`),
    index("vehicles_lower_model_idx").on(sql`lower(${t.model})`),
  ],
);

export const fitments = pgTable(
  "fitments",
  {
    ...commonColumns(),
    partId: uuid("part_id")
      .notNull()
      .references(() => parts.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    note: text("note"),
    source: text("source").notNull(),
    verified: boolean("verified").notNull().default(false),
  },
  (t) => [
    check("fitments_source_check", oneOf(t.source, FITMENT_SOURCES)),
    uniqueIndex("fitments_part_vehicle_idx")
      .on(t.partId, t.vehicleId)
      .where(sql`${t.deletedAt} is null`),
    index("fitments_part_id_idx").on(t.partId),
    index("fitments_vehicle_id_idx").on(t.vehicleId),
  ],
);
