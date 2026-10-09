import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  ACCOUNT_KINDS,
  CUSTOMER_TYPES,
  PART_NUMBER_KINDS,
  PART_POSITIONS,
  PART_QUALITIES,
  PART_UNITS,
  PART_VEHICLE_TYPES,
  VEHICLE_TYPES,
} from "@geargrid/db";

// The hand-written catalog in data/*.json, checked on load so a typo stops the seed with a clear message.

const taka = z.number().int().nonnegative();

const categorySchema = z.object({ name_en: z.string().min(1), name_bn: z.string().min(1) });
const vehicleSchema = z.object({
  key: z.string().min(1),
  vehicle_type: z.enum(VEHICLE_TYPES),
  make: z.string().min(1),
  model: z.string().min(1),
  year_from: z.number().int(),
  year_to: z.number().int().nullable(),
  engine_code: z.string().nullable(),
  body: z.string().nullable(),
  source: z.enum(["starter", "shop"]),
});
const partSchema = z.object({
  number: z.string().min(1), // the main part number: the part's natural key
  name_en: z.string().min(1),
  name_bn: z.string().min(1),
  category: z.string().min(1),
  brand: z.string().nullable(),
  vehicle_type: z.enum(PART_VEHICLE_TYPES),
  quality: z.enum(PART_QUALITIES),
  position: z.enum(PART_POSITIONS).nullable(),
  unit: z.enum(PART_UNITS),
  pack_size: z.number().positive().nullable(),
  rack: z.string().min(1),
  retail_taka: taka,
  garage_taka: taka.nullable(), // the paikari price (D144)
  cost_taka: taka,
  reorder_level: z.number().nonnegative(),
  fits: z.array(z.string()),
  unverified: z.array(z.string()),
  numbers: z.array(
    z.object({ number: z.string().min(1), kind: z.enum(PART_NUMBER_KINDS), brand: z.string().nullable() }),
  ),
  stock: z.number().int().nonnegative().optional(), // exact final stock (anchors and edge rows)
  active: z.boolean().optional(),
  deleted: z.boolean().optional(),
  notes: z.string().optional(),
});
const aliasSchema = z.union([
  z.object({ alias: z.string().min(1), category: z.string().min(1) }),
  z.object({ alias: z.string().min(1), part: z.string().min(1) }),
]);
const customerSchema = z.object({
  name: z.string().min(1),
  type: z.enum(CUSTOMER_TYPES),
  phone: z.string().min(1),
  address: z.string().min(1),
  credit_limit_taka: taka.nullable().optional(),
  bulk: z.boolean().optional(), // a trader that buys in bulk by bank (history only)
  final_due_taka: taka.optional(), // anchors: the due after all generated history
});
const supplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  kind: z.enum(["car", "motorcycle", "fluid"]), // what the generator buys from it
});
const accountSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(ACCOUNT_KINDS),
  number: z.string().nullable(),
  opening_balance_taka: taka,
});

export type CategoryData = z.infer<typeof categorySchema>;
export type VehicleData = z.infer<typeof vehicleSchema>;
export type PartData = z.infer<typeof partSchema>;
export type AliasData = z.infer<typeof aliasSchema>;
export type CustomerData = z.infer<typeof customerSchema>;
export type SupplierData = z.infer<typeof supplierSchema>;
export type AccountData = z.infer<typeof accountSchema>;

export interface CatalogData {
  categories: CategoryData[];
  brands: string[];
  vehicles: VehicleData[];
  parts: PartData[];
  aliases: AliasData[];
  customers: CustomerData[];
  suppliers: SupplierData[];
  accounts: AccountData[];
}

function load<T>(file: string, schema: z.ZodType<T>): T {
  const path = new URL(`./data/${file}`, import.meta.url);
  const result = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`data/${file}: ${issue?.path.join(".")}: ${issue?.message}`);
  }
  return result.data;
}

export function loadCatalog(): CatalogData {
  return {
    categories: load("categories.json", z.array(categorySchema)),
    brands: load("brands.json", z.array(z.string().min(1))),
    vehicles: load("vehicles.json", z.array(vehicleSchema)),
    parts: load("parts.json", z.array(partSchema)),
    aliases: load("aliases.json", z.array(aliasSchema)),
    customers: load("customers.json", z.array(customerSchema)),
    suppliers: load("suppliers.json", z.array(supplierSchema)),
    accounts: load("accounts.json", z.array(accountSchema)),
  };
}
