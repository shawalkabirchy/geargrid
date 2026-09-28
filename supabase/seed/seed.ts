import { formatQuantity, uuidv5 } from "@geargrid/core";
import {
  accounts,
  accountTransactions,
  API_SCOPES,
  apiKeys,
  brands,
  categories,
  cheques,
  createDb,
  customerLedger,
  customerPayments,
  customers,
  devices,
  fitments,
  invoiceCounters,
  partAliases,
  partNumbers,
  parts,
  purchaseItems,
  purchases,
  returnItems,
  returns,
  saleItems,
  salePayments,
  sales,
  settings,
  stockLevels,
  stockMovements,
  supplierLedger,
  supplierPayments,
  suppliers,
  users,
  vehicles,
  type Db,
} from "@geargrid/db";
import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { isMain, log, readEnv, runMain } from "../../scripts/lib/cli";
import { loadCatalog } from "./data";
import {
  dhakaTime,
  runHistory,
  type HistoryCustomer,
  type HistoryPart,
  type HistorySupplier,
} from "./history";

// The one shared dataset both apps test against (spec 5.5): the hand-written catalog in data/*.json plus
// 60 days of generated history. IDs are UUIDv5 of natural keys, so every run gives the same IDs.

/** Fixed namespace of every seed ID. Never change it: test labels and DokaanBondhu's fixtures depend on the IDs. */
export const SEED_NAMESPACE = "3f1c2a7e-8b4d-4c6a-9e1f-5a2b7c9d0e13";
/** The owner's fixed Supabase Auth user ID (the seed's one login; no FK to auth.users). */
export const SEED_OWNER_AUTH_USER_ID = "00000000-0000-4000-8000-000000000001";
export const API_KEY_PATTERN = /^ggk_[0-9A-Za-z]{32}$/;
const API_KEY_PREFIX_LENGTH = 8;

type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface SeedOptions {
  apiKey: string; // SEED_API_KEY: only its SHA-256 hash is stored
  now: Date; // history counts back from this time, so "yesterday" is always yesterday
}

const toTaka = (taka: number) => BigInt(taka); // whole taka (D92)
const normalizeNumber = (value: string) => value.toUpperCase().replace(/[\s-]/g, "");

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** IDs from natural keys; a key used twice is a mistake in the data, so the seed stops. */
function createIds() {
  const used = new Set<string>();
  return async (key: string): Promise<string> => {
    if (used.has(key)) throw new Error(`seed: natural key used twice: ${key}`);
    used.add(key);
    return uuidv5(key, SEED_NAMESPACE);
  };
}

async function insertAll<T extends PgTable>(
  executor: Executor,
  table: T,
  rows: T["$inferInsert"][],
): Promise<void> {
  for (let start = 0; start < rows.length; start += 500) {
    await executor.insert(table).values(rows.slice(start, start + 500));
  }
}

/** Writes the whole dataset into an empty database, inside the caller's transaction. */
export async function seedInto(executor: Executor, options: SeedOptions): Promise<Record<string, number>> {
  if (!API_KEY_PATTERN.test(options.apiKey))
    throw new Error("SEED_API_KEY must be ggk_ plus 32 base62 characters");
  const catalog = loadCatalog();
  const id = createIds();
  const start = dhakaTime(options.now, 61, 9 * 60); // the day the shop's records begin
  const stamp = { createdAt: start, updatedAt: start };

  // Shop, owner, the counter phone and the test API key.
  const ownerId = await id("user:owner");
  const deviceId = await id("device:M1");
  const shopRows = {
    settings: [
      {
        id: 1,
        shopName: "Demo Auto Parts",
        marketArea: "Bangshal, Dhaka",
        phone: "02-7390100",
        address: "12 Nawabpur Road, Dhaka",
        language: "bn",
        banglaDigits: true,
        roundOffRule: 1,
        defaultCreditLimit: toTaka(30000),
        defaultReorderLevel: "2.000",
        updatedAt: start,
      },
    ],
    users: [
      {
        id: ownerId,
        authUserId: SEED_OWNER_AUTH_USER_ID,
        name: "Shop Owner (demo)",
        phone: "01711-000001",
        email: "owner@demo-auto-parts.test",
        role: "owner",
        status: "active",
        ...stamp,
      },
    ],
    devices: [
      { id: deviceId, userId: ownerId, deviceCode: "M1", platform: "android", appVersion: "seed", ...stamp },
    ],
    apiKeys: [
      {
        id: await id("api_key:DokaanBondhu (test)"),
        name: "DokaanBondhu (test)",
        keyPrefix: options.apiKey.slice(0, API_KEY_PREFIX_LENGTH),
        keyHash: await sha256Hex(options.apiKey),
        scopes: [...API_SCOPES],
        auditSource: "ai",
        ...stamp,
      },
    ],
    invoiceCounters: [
      { prefix: "W", lastSequence: 0n },
      { prefix: "A", lastSequence: 0n },
    ],
  };

  // Catalog.
  const categoryIds = new Map<string, string>();
  const categoryRows = [];
  for (const category of catalog.categories) {
    const categoryId = await id(`category:${category.name_en}`);
    categoryIds.set(category.name_en, categoryId);
    categoryRows.push({ id: categoryId, nameEn: category.name_en, nameBn: category.name_bn, ...stamp });
  }
  const brandIds = new Map<string, string>();
  const brandRows = [];
  for (const name of catalog.brands) {
    const brandId = await id(`brand:${name}`);
    brandIds.set(name, brandId);
    brandRows.push({ id: brandId, name, ...stamp });
  }
  const vehicleIds = new Map<string, string>();
  const vehicleRows = [];
  for (const vehicle of catalog.vehicles) {
    const vehicleId = await id(`vehicle:${vehicle.key}`);
    vehicleIds.set(vehicle.key, vehicleId);
    vehicleRows.push({
      id: vehicleId,
      vehicleType: vehicle.vehicle_type,
      make: vehicle.make,
      model: vehicle.model,
      yearFrom: vehicle.year_from,
      yearTo: vehicle.year_to,
      engineCode: vehicle.engine_code,
      body: vehicle.body,
      source: vehicle.source,
      ...stamp,
    });
  }
  const lookup = (map: Map<string, string>, key: string, what: string) => {
    const value = map.get(key);
    if (value === undefined) throw new Error(`seed data: unknown ${what} ${key}`);
    return value;
  };

  const historyParts: HistoryPart[] = [];
  const partRows = [];
  const partNumberRows = [];
  const fitmentRows = [];
  for (const part of catalog.parts) {
    const partId = await id(`part:${part.number}`);
    historyParts.push({
      id: partId,
      number: part.number,
      data: part,
      category: part.category,
      retail: toTaka(part.retail_taka),
      garage: part.garage_taka === null ? null : toTaka(part.garage_taka),
      wholesale: part.wholesale_taka === null ? null : toTaka(part.wholesale_taka),
      avgCost: toTaka(part.cost_taka),
      stock: 0n,
      opening: 0n,
      exactStock: part.stock === undefined ? null : BigInt(part.stock) * 1000n,
    });
    partRows.push({
      id: partId,
      nameEn: part.name_en,
      nameBn: part.name_bn,
      categoryId: lookup(categoryIds, part.category, "category"),
      brandId: part.brand === null ? null : lookup(brandIds, part.brand, "brand"),
      vehicleType: part.vehicle_type,
      quality: part.quality,
      position: part.position,
      unit: part.unit,
      packSize: part.pack_size === null ? null : formatQuantity(BigInt(Math.round(part.pack_size * 1000))),
      rackLocation: part.rack,
      retailPrice: toTaka(part.retail_taka),
      garagePrice: part.garage_taka === null ? null : toTaka(part.garage_taka),
      wholesalePrice: part.wholesale_taka === null ? null : toTaka(part.wholesale_taka),
      avgCost: toTaka(part.cost_taka),
      reorderLevel: formatQuantity(BigInt(Math.round(part.reorder_level * 1000))),
      notes: part.notes ?? null,
      isActive: part.active !== false,
      deletedAt: part.deleted ? start : null,
      ...stamp,
    });
    const numbers = [
      {
        number: part.number,
        kind: part.quality === "genuine" ? "oem" : part.brand ? "aftermarket" : "supplier",
        brand: part.brand,
        isMain: true,
      },
      ...part.numbers.map((n) => ({ ...n, isMain: false })),
    ];
    for (const number of numbers) {
      partNumberRows.push({
        id: await id(`part_number:${part.number}:${number.number}`),
        partId,
        number: number.number,
        numberNormalized: normalizeNumber(number.number),
        kind: number.kind,
        brand: number.brand,
        isMain: number.isMain,
        ...stamp,
      });
    }
    for (const vehicleKey of part.fits) {
      const verified = !part.unverified.includes(vehicleKey);
      fitmentRows.push({
        id: await id(`fitment:${part.number}:${vehicleKey}`),
        partId,
        vehicleId: lookup(vehicleIds, vehicleKey, "vehicle"),
        source: verified ? "catalog" : "owner",
        verified,
        note: verified ? null : "Not yet checked",
        ...stamp,
      });
    }
  }
  const partIds = new Map(historyParts.map((part) => [part.number, part.id]));
  const aliasRows = [];
  for (const alias of catalog.aliases) {
    const target =
      "category" in alias
        ? { categoryId: lookup(categoryIds, alias.category, "category"), partId: null }
        : { partId: lookup(partIds, alias.part, "part"), categoryId: null };
    const targetKey = "category" in alias ? `category:${alias.category}` : `part:${alias.part}`;
    aliasRows.push({
      id: await id(`alias:${alias.alias}:${targetKey}`),
      aliasText: alias.alias,
      ...target,
      ...stamp,
    });
  }

  // People and money accounts.
  const accountIds = new Map<string, string>();
  const accountRows = [];
  for (const account of catalog.accounts) {
    const accountId = await id(`account:${account.name}`);
    accountIds.set(account.kind, accountId);
    accountRows.push({
      id: accountId,
      name: account.name,
      kind: account.kind,
      number: account.number,
      openingBalance: toTaka(account.opening_balance_taka),
      ...stamp,
    });
  }
  const historyCustomers: HistoryCustomer[] = [];
  for (const customer of catalog.customers) {
    historyCustomers.push({
      id: await id(`customer:${customer.name}`),
      name: customer.name,
      data: customer,
      tier: customer.type,
      anchorDue: customer.final_due_taka === undefined ? null : toTaka(customer.final_due_taka),
      due: 0n,
      provisionalOpening: 0n,
      opening: 0n,
    });
  }
  const historySuppliers: HistorySupplier[] = [];
  for (const [index, supplier] of catalog.suppliers.entries()) {
    historySuppliers.push({
      id: await id(`supplier:${supplier.name}`),
      data: supplier,
      payable: 0n,
      opening: 0n,
      billPrefix: ["NAP", "BMS", "JAP", "DBP", "ELB"][index] ?? `S${index + 1}`,
    });
  }

  const { book } = await runHistory({
    now: options.now,
    parts: historyParts,
    customers: historyCustomers,
    suppliers: historySuppliers,
    id,
    deviceId,
    accounts: {
      cash: lookup(accountIds, "cash", "account"),
      byMethod: (method) => lookup(accountIds, method, "account"),
    },
  });

  // Opening entries come first in each ledger and in the stock movements.
  const openingMovements = [];
  for (const part of historyParts) {
    if (part.opening === 0n) continue;
    openingMovements.push({
      id: await id(`movement:opening:${part.number}`),
      partId: part.id,
      qtyChange: formatQuantity(part.opening),
      reason: "opening",
      refType: null,
      refId: null,
      unitCost: toTaka(part.data.cost_taka),
      ...stamp,
    });
  }
  const customerOpenings = [];
  for (const customer of historyCustomers) {
    if (customer.opening === 0n) continue;
    customerOpenings.push({
      id: await id(`customer_ledger:opening:${customer.name}`),
      customerId: customer.id,
      entryType: "opening",
      refType: null,
      refId: null,
      debit: customer.opening,
      credit: 0n,
      balanceAfter: customer.opening,
      ...stamp,
    });
  }
  const supplierOpenings = [];
  for (const supplier of historySuppliers) {
    if (supplier.opening === 0n) continue;
    supplierOpenings.push({
      id: await id(`supplier_ledger:opening:${supplier.data.name}`),
      supplierId: supplier.id,
      entryType: "opening",
      refType: null,
      refId: null,
      debit: supplier.opening,
      credit: 0n,
      balanceAfter: supplier.opening,
      ...stamp,
    });
  }
  const openingShift = new Map(historyCustomers.map((c) => [c.id, c.opening - c.provisionalOpening]));
  const customerLedgerRows = book.customerLedger.map(({ provisionalBalance, ...row }) => ({
    ...row,
    balanceAfter: provisionalBalance + (openingShift.get(row.customerId) ?? 0n),
  }));
  const supplierLedgerRows = book.supplierLedger.map(({ provisionalBalance, ...row }) => ({
    ...row,
    balanceAfter: provisionalBalance,
  }));
  const lastMovement = new Map<string, Date>();
  for (const row of book.stockMovements) {
    if (row.createdAt instanceof Date) lastMovement.set(row.partId, row.createdAt);
  }

  const customerRows = historyCustomers.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.data.type,
    priceTier: c.tier,
    phone: c.data.phone,
    address: c.data.address,
    creditLimit: c.data.credit_limit_taka == null ? null : toTaka(c.data.credit_limit_taka),
    openingDue: c.opening,
    dueBalance: c.due,
    ...stamp,
  }));
  const supplierRows = historySuppliers.map((s) => ({
    id: s.id,
    name: s.data.name,
    phone: s.data.phone,
    address: s.data.address,
    openingPayable: s.opening,
    payableBalance: s.payable,
    ...stamp,
  }));
  const stockLevelRows = historyParts.map((part) => ({
    partId: part.id,
    quantity: formatQuantity(part.stock),
    updatedAt: lastMovement.get(part.id) ?? start,
  }));
  for (const row of partRows) {
    const part = historyParts.find((p) => p.id === row.id);
    if (part) row.avgCost = part.avgCost;
  }

  // Insert in foreign-key order; ledgers and movements in time order, so seq follows the running balance.
  await insertAll(executor, settings, shopRows.settings);
  await insertAll(executor, users, shopRows.users);
  await insertAll(executor, devices, shopRows.devices);
  await insertAll(executor, apiKeys, shopRows.apiKeys);
  await insertAll(executor, invoiceCounters, shopRows.invoiceCounters);
  await insertAll(executor, categories, categoryRows);
  await insertAll(executor, brands, brandRows);
  await insertAll(executor, vehicles, vehicleRows);
  await insertAll(executor, parts, partRows);
  await insertAll(executor, partNumbers, partNumberRows);
  await insertAll(executor, partAliases, aliasRows);
  await insertAll(executor, fitments, fitmentRows);
  await insertAll(executor, accounts, accountRows);
  await insertAll(executor, customers, customerRows);
  await insertAll(executor, suppliers, supplierRows);
  await insertAll(executor, cheques, book.cheques);
  await insertAll(executor, sales, book.sales);
  await insertAll(executor, saleItems, book.saleItems);
  await insertAll(executor, salePayments, book.salePayments);
  await insertAll(executor, customerPayments, book.customerPayments);
  await insertAll(executor, returns, book.returns);
  await insertAll(executor, returnItems, book.returnItems);
  await insertAll(executor, purchases, book.purchases);
  await insertAll(executor, purchaseItems, book.purchaseItems);
  await insertAll(executor, supplierPayments, book.supplierPayments);
  await insertAll(executor, stockMovements, [...openingMovements, ...book.stockMovements]);
  await insertAll(executor, stockLevels, stockLevelRows);
  await insertAll(executor, accountTransactions, book.accountTransactions);
  await insertAll(executor, customerLedger, [...customerOpenings, ...customerLedgerRows]);
  await insertAll(executor, supplierLedger, [...supplierOpenings, ...supplierLedgerRows]);

  return {
    parts: partRows.length,
    part_numbers: partNumberRows.length,
    fitments: fitmentRows.length,
    aliases: aliasRows.length,
    vehicles: vehicleRows.length,
    customers: customerRows.length,
    sales: book.sales.length,
    purchases: book.purchases.length,
    customer_payments: book.customerPayments.length,
    returns: book.returns.length,
    cheques: book.cheques.length,
  };
}

/** Seeds an empty database in one transaction; refuses a database that already has data. */
export async function seedDatabase(db: Db, options: SeedOptions): Promise<Record<string, number>> {
  return db.transaction(async (tx) => {
    const existing = await tx.execute(sql`select 1 from settings limit 1`);
    if (existing.rows.length > 0) throw new Error("already seeded: use npm run db:reset-demo to start again");
    return seedInto(tx, options);
  });
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const env = readEnv({
      MIGRATION_DATABASE_URL: z.string().min(1),
      SEED_API_KEY: z.string().regex(API_KEY_PATTERN, "must be ggk_ plus 32 base62 characters"),
    });
    const { db, pool } = createDb(env.MIGRATION_DATABASE_URL, 1);
    try {
      const summary = await seedDatabase(db, { apiKey: env.SEED_API_KEY, now: new Date() });
      log(
        `Seeded: ${Object.entries(summary)
          .map(([table, count]) => `${table} ${count}`)
          .join(", ")}`,
      );
    } finally {
      await pool.end();
    }
  });
}
