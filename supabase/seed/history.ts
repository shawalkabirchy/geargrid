import { formatQuantity, lineValue, roundHalfAwayFromZero, roundOff, type PriceTier } from "@geargrid/core";
import type { CustomerData, PartData, SupplierData } from "./data";
import {
  Book,
  type AccountRefs,
  type CustomerRef,
  type IdOf,
  type PartRef,
  type PaymentMethod,
  type PaymentPlan,
  type PurchaseEvent,
  type SaleEvent,
  type SaleLine,
  type SupplierRef,
} from "./posting";
import { createRandom, type Random } from "./random";

// 60 days of shop history from a fixed pseudo-random seed (spec 5.5). Every choice is drawn before anything is
// posted, so the same seed always gives the same rows; only the timestamps follow the time of the run.

export const HISTORY_SEED = 20260924;
const HISTORY_DAYS = 60;
const SALES = 150; // including Karim Auto's one-line sale yesterday
const CUSTOMER_PAYMENTS = 60;
const PURCHASES = 30;
const SUPPLIER_PAYMENTS = 10;
const RETURNS = 4;
const VOIDS = 2;
const OTHER_CUSTOMERS_MAX_DUE = 15_000n; // taka: every customer but the anchors stays below this

const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3_600_000;
const TAKA = 1n; // money is whole taka (D92)
const UNIT = 1000n; // one unit in milli-units

export interface HistoryPart extends PartRef {
  data: PartData;
  category: string;
  retail: bigint;
  garage: bigint | null;
  wholesale: bigint | null;
  exactStock: bigint | null; // milli-units, for anchors and edge rows
  opening: bigint; // milli-units, solved before posting
}

export interface HistoryCustomer extends CustomerRef {
  data: CustomerData;
  tier: PriceTier;
  anchorDue: bigint | null;
  provisionalOpening: bigint;
  opening: bigint; // solved after posting for anchors
}

export interface HistorySupplier extends SupplierRef {
  data: SupplierData;
  opening: bigint;
  billPrefix: string;
}

export interface HistoryInput {
  now: Date;
  parts: HistoryPart[];
  customers: HistoryCustomer[];
  suppliers: HistorySupplier[];
  accounts: AccountRefs;
  deviceId: string;
  id: IdOf;
}

interface CustomerPaymentSlot {
  kind: "customer_payment";
  time: Date;
  pickRoll: number;
  fraction: number;
  method: PaymentMethod;
  trxId: string;
  chequeNo: string;
  chequeBank: string;
  chequeDays: number;
}

interface SupplierPaymentSlot {
  kind: "supplier_payment";
  time: Date;
  pickRoll: number;
  fraction: number;
  method: PaymentMethod;
  trxId: string;
}

interface ReturnEvent {
  kind: "return";
  time: Date;
  sale: SaleEvent;
  lineIndex: number;
  quantity: bigint;
  restock: "yes" | "damaged";
  reason: string;
}

interface VoidEvent {
  kind: "void";
  time: Date;
  sale: SaleEvent;
}

type HistoryEvent =
  SaleEvent | PurchaseEvent | CustomerPaymentSlot | SupplierPaymentSlot | ReturnEvent | VoidEvent;

/** A time on a shop day in Dhaka (UTC+6): days before today, minutes after local midnight. */
export function dhakaTime(now: Date, daysAgo: number, minutes: number): Date {
  const localMidnight = Math.floor((now.getTime() + DHAKA_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(localMidnight - daysAgo * DAY_MS - DHAKA_OFFSET_MS + minutes * 60_000);
}

/** The Dhaka calendar date of a time, days later, as YYYY-MM-DD. */
function dhakaDate(time: Date, daysLater: number): string {
  return new Date(time.getTime() + DHAKA_OFFSET_MS + daysLater * DAY_MS).toISOString().slice(0, 10);
}

function shopTime(random: Random, now: Date, fromDaysAgo: number, toDaysAgo: number): Date {
  return dhakaTime(now, random.int(toDaysAgo, fromDaysAgo), random.int(10 * 60, 20 * 60 - 1));
}

const isFriction = (part: HistoryPart) => /brake (pad|shoe)/i.test(part.data.name_en);
const sellable = (part: HistoryPart) => part.data.active !== false && part.data.deleted !== true;

const CATEGORY_WEIGHT: Record<string, number> = {
  Filters: 4,
  Brakes: 3,
  "Oils and fluids": 3,
  Ignition: 2,
  "Belts and hoses": 1.5,
};

function tierPriceOf(part: HistoryPart, tier: PriceTier): bigint {
  if (tier === "garage") return part.garage ?? part.retail;
  if (tier === "wholesale") return part.wholesale ?? part.retail;
  return part.retail;
}

function saleQuantity(random: Random, part: HistoryPart, wholesale: boolean): bigint {
  let quantity: bigint;
  if (part.data.unit === "liter") quantity = BigInt(random.pick([1000, 2000, 3000, 3500, 4000]));
  else if (/spark plug|hub bolt/i.test(part.data.name_en)) quantity = BigInt(random.pick([1, 4, 4])) * UNIT;
  else quantity = BigInt(random.chance(0.8) ? 1 : 2) * UNIT;
  return wholesale ? quantity * BigInt(random.int(4, 8)) : quantity;
}

function paymentMethod(random: Random, weights: [PaymentMethod, number][]): PaymentMethod {
  return random.weighted(weights, ([, weight]) => weight)[0];
}

function trxFor(random: Random, method: PaymentMethod): string | null {
  const code = random.code(10);
  if (method === "cash" || method === "cheque") return null;
  return method === "bank" ? `TT${code.slice(0, 8)}` : code;
}

/** Rounds an amount down to whole units of `step` taka. */
const floorTo = (amount: bigint, step: bigint) => (amount / step) * step;

function buildSale(random: Random, now: Date, parts: HistoryPart[], customers: HistoryCustomer[]): SaleEvent {
  const time = shopTime(random, now, HISTORY_DAYS, 1);
  const customer = random.chance(0.4)
    ? null
    : random.weighted(customers, (c) =>
        c.data.type === "garage" ? 3 : c.data.type === "wholesale" ? 1.5 : 1,
      );
  const tier: PriceTier = customer?.tier ?? "retail";
  const wholesale = customer?.data.type === "wholesale";
  const pool = parts.filter(
    (part) => sellable(part) && !(customer?.name === "Karim Auto" && isFriction(part)),
  );
  const lineCount = random.weighted([1, 2, 3], (n) => (n === 1 ? 50 : n === 2 ? 35 : 15));
  const lines: SaleLine[] = [];
  while (lines.length < lineCount) {
    const part = random.weighted(
      pool,
      (p) => (CATEGORY_WEIGHT[p.category] ?? 1) * (p.data.vehicle_type === "motorcycle" ? 0.6 : 1),
    );
    if (lines.some((line) => line.part === part)) continue;
    lines.push({
      part,
      quantity: saleQuantity(random, part, wholesale),
      unitPrice: tierPriceOf(part, tier),
      tier,
    });
  }
  const subtotal = lines.reduce((sum, line) => sum + lineValue(line.quantity, line.unitPrice), 0n);
  let discount = 0n;
  if (!customer && random.chance(0.12)) discount = BigInt(random.int(1, 4)) * 50n * TAKA;
  else if (!customer && random.chance(0.05)) discount = roundHalfAwayFromZero(subtotal * 500n, 10_000n);
  else if (wholesale && random.chance(0.3)) discount = roundHalfAwayFromZero(subtotal * 300n, 10_000n);
  if (discount * 5n > subtotal) discount = 0n;
  const { rounded: total, adjustment } = roundOff(subtotal - discount, 1);

  let paid = total;
  const roll = random.next();
  const partial = floorTo((total * BigInt(random.int(30, 70))) / 100n, 100n * TAKA);
  if (customer?.data.type === "garage") paid = roll < 0.45 ? 0n : roll < 0.7 ? partial : total;
  else if (customer?.data.type === "retail") paid = roll < 0.75 ? total : partial;
  else if (wholesale) paid = roll < 0.5 ? partial : total;
  const method = wholesale
    ? "bank"
    : paymentMethod(random, [
        ["cash", 70],
        ["bkash", 20],
        ["nagad", 10],
      ]);
  const payments: PaymentPlan[] = paid > 0n ? [{ method, amount: paid, trxId: trxFor(random, method) }] : [];
  return {
    kind: "sale",
    time,
    customer,
    lines,
    subtotal,
    discount,
    roundOff: adjustment,
    total,
    paid,
    due: total - paid,
    payments,
    note: null,
  };
}

function buildPurchase(
  random: Random,
  now: Date,
  parts: HistoryPart[],
  suppliers: HistorySupplier[],
): PurchaseEvent {
  const time = shopTime(random, now, HISTORY_DAYS, 1);
  const supplier = random.weighted(suppliers, (s) =>
    s.data.kind === "car" ? 3 : s.data.kind === "motorcycle" ? 1.5 : 1,
  );
  const pool = parts.filter((part) => {
    if (!sellable(part) || part.exactStock !== null) return false;
    if (supplier.data.kind === "fluid") return part.category === "Oils and fluids";
    if (supplier.data.kind === "motorcycle") return part.data.vehicle_type === "motorcycle";
    return part.data.vehicle_type !== "motorcycle" && part.category !== "Oils and fluids";
  });
  const lineCount = random.int(2, 5);
  const lines: PurchaseEvent["lines"] = [];
  while (lines.length < lineCount && lines.length < pool.length) {
    const part = random.pick(pool);
    if (lines.some((line) => line.part === part)) continue;
    const quantity =
      BigInt(
        part.data.unit === "liter"
          ? random.int(8, 24)
          : part.data.unit === "set"
            ? random.int(2, 6)
            : random.int(2, 10),
      ) * UNIT;
    const unitCost = floorTo(
      (BigInt(part.data.cost_taka) * TAKA * BigInt(random.int(97, 106))) / 100n,
      10n * TAKA,
    );
    lines.push({ part, quantity, unitCost });
  }
  const total = lines.reduce((sum, line) => sum + lineValue(line.quantity, line.unitCost), 0n);
  const roll = random.next();
  const amount = roll < 0.35 ? total : roll < 0.75 ? floorTo(total / 2n, 1000n * TAKA) : 0n;
  const method = paymentMethod(random, [
    ["bank", 60],
    ["cash", 40],
  ]);
  const payments: PaymentPlan[] = amount > 0n ? [{ method, amount, trxId: trxFor(random, method) }] : [];
  return {
    kind: "purchase",
    time,
    supplier,
    billNo: `${supplier.billPrefix}-${random.int(1000, 9999)}`,
    lines,
    payments,
  };
}

/** Solves every part's opening stock: exact for anchors and edge rows, a little above the reorder level otherwise. */
function solveOpeningStock(random: Random, parts: HistoryPart[], events: HistoryEvent[]): void {
  const changes = new Map<HistoryPart, bigint[]>();
  const add = (part: PartRef, change: bigint) => {
    const history = part as HistoryPart;
    changes.set(history, [...(changes.get(history) ?? []), change]);
  };
  for (const event of events) {
    if (event.kind === "sale") for (const line of event.lines) add(line.part, -line.quantity);
    if (event.kind === "void") for (const line of event.sale.lines) add(line.part, line.quantity);
    if (event.kind === "return" && event.restock === "yes") {
      const line = event.sale.lines[event.lineIndex];
      if (line) add(line.part, event.quantity);
    }
    if (event.kind === "purchase") for (const line of event.lines) add(line.part, line.quantity);
  }
  for (const part of parts) {
    let running = 0n;
    let lowest = 0n;
    for (const change of changes.get(part) ?? []) {
      running += change;
      if (running < lowest) lowest = running;
    }
    const needed = -lowest; // the opening that keeps the stock from ever going below zero
    if (part.exactStock !== null) {
      part.opening = part.exactStock - running;
      if (part.opening < needed) {
        throw new Error(`seed data: part ${part.number} cannot end at ${formatQuantity(part.exactStock)}`);
      }
    } else {
      const reorder = BigInt(Math.round(part.data.reorder_level * 1000));
      const wanted = reorder + BigInt(random.int(1, 10)) * UNIT;
      part.opening = wanted - running > needed ? wanted - running : needed;
    }
    part.stock = part.opening;
  }
}

/** Draws every event of the history, then posts them in time order. */
export async function runHistory(input: HistoryInput): Promise<{ book: Book; events: number }> {
  const { now, parts, customers, suppliers } = input;
  const random = createRandom(HISTORY_SEED);

  // Provisional opening dues and payables; anchors start at zero and get their opening due at the end.
  for (const customer of customers) {
    let opening = 0n;
    if (customer.anchorDue === null) {
      if (customer.data.type === "garage" && random.chance(0.6))
        opening = BigInt(random.int(10, 70)) * 100n * TAKA;
      if (customer.data.type === "retail" && random.chance(0.2))
        opening = BigInt(random.int(5, 30)) * 100n * TAKA;
      if (customer.data.type === "wholesale") opening = BigInt(random.int(10, 60)) * 100n * TAKA;
    }
    customer.provisionalOpening = opening;
    customer.due = opening;
  }
  for (const supplier of suppliers) {
    supplier.opening = BigInt(random.int(10, 60)) * 1000n * TAKA;
    supplier.payable = supplier.opening;
  }

  const sales: SaleEvent[] = [];
  for (let i = 0; i < SALES - 1; i++) sales.push(buildSale(random, now, parts, customers));

  // Karim Auto bought one set of the aftermarket Axio and Premio 2012-2017 front pads yesterday, on credit (A.5).
  const karim = customers.find((c) => c.name === "Karim Auto");
  const karimPad = parts.find(
    (p) =>
      p.data.quality === "aftermarket" &&
      p.data.name_en === "Front brake pad set" &&
      p.data.fits.includes("toyota-axio-2012") &&
      p.data.fits.includes("toyota-premio-2012"),
  );
  if (!karim || !karimPad || karimPad.garage === null)
    throw new Error("seed data: Karim Auto's anchor is missing");
  const karimSale: SaleEvent = {
    kind: "sale",
    time: dhakaTime(now, 1, 16 * 60 + 20),
    customer: karim,
    lines: [{ part: karimPad, quantity: UNIT, unitPrice: karimPad.garage, tier: "garage" }],
    subtotal: karimPad.garage,
    discount: 0n,
    roundOff: 0n,
    total: karimPad.garage,
    paid: 0n,
    due: karimPad.garage,
    payments: [],
    note: null,
  };
  sales.push(karimSale);

  const events: HistoryEvent[] = [...sales];

  // Two voided sales: paid walk-in sales, voided the same day.
  const voidable = sales.filter(
    (s) =>
      s !== karimSale && s.customer === null && s.paid > 0n && s.time.getTime() < now.getTime() - 3 * DAY_MS,
  );
  for (let i = 0; i < VOIDS; i++) {
    const sale = random.pick(voidable.filter((s) => !s.voided));
    const time = new Date(sale.time.getTime() + random.int(15, 90) * 60_000);
    sale.voided = { time, reason: random.pick(["Wrong part entered", "Customer changed mind"]) };
    events.push({ kind: "void", time, sale });
  }

  // Four returns of customer sales; the lines are never anchor or edge parts, whose stock is exact.
  const returnable = sales.filter(
    (s) =>
      s !== karimSale &&
      s.customer !== null &&
      !s.voided &&
      s.lines.some((line) => (line.part as HistoryPart).exactStock === null),
  );
  const reasons = ["Did not fit", "Wrong size", "Customer changed mind", "Damaged in the box"];
  const returned = new Set<SaleEvent>();
  while (returned.size < RETURNS) {
    const sale = random.pick(returnable);
    const time = new Date(sale.time.getTime() + random.int(1, 5) * DAY_MS + random.int(0, 120) * 60_000);
    if (returned.has(sale) || time.getTime() >= dhakaTime(now, 0, 0).getTime()) continue;
    const lineIndex = sale.lines.findIndex((line) => (line.part as HistoryPart).exactStock === null);
    const line = sale.lines[lineIndex];
    if (!line) continue;
    returned.add(sale);
    const damaged = returned.size === RETURNS;
    events.push({
      kind: "return",
      time,
      sale,
      lineIndex,
      quantity: line.quantity < UNIT ? line.quantity : UNIT,
      restock: damaged ? "damaged" : "yes",
      reason: damaged ? "Damaged in the box" : random.pick(reasons.slice(0, 3)),
    });
  }

  const chequeSlots = new Set([random.int(0, CUSTOMER_PAYMENTS - 1), random.int(0, CUSTOMER_PAYMENTS - 1)]);
  for (let i = 0; i < CUSTOMER_PAYMENTS; i++) {
    const cheque = chequeSlots.has(i);
    const method = cheque
      ? "cheque"
      : paymentMethod(random, [
          ["cash", 45],
          ["bkash", 30],
          ["bank", 15],
          ["nagad", 10],
        ]);
    events.push({
      kind: "customer_payment",
      time: shopTime(random, now, HISTORY_DAYS, 1),
      pickRoll: random.next(),
      fraction: 0.3 + 0.7 * random.next(),
      method,
      trxId: random.code(10),
      chequeNo: String(random.int(1_000_000, 9_999_999)),
      chequeBank: random.pick(["Dutch-Bangla Bank", "BRAC Bank", "Islami Bank Bangladesh"]),
      chequeDays: random.int(10, 25),
    });
  }

  const purchases: PurchaseEvent[] = [];
  for (let i = 0; i < PURCHASES; i++) purchases.push(buildPurchase(random, now, parts, suppliers));
  const chequePurchase = random.pick(purchases.filter((p) => p.payments.length > 0));
  const firstPayment = chequePurchase.payments[0];
  if (firstPayment) {
    chequePurchase.payments[0] = {
      method: "cheque",
      amount: firstPayment.amount,
      trxId: null,
      cheque: {
        bank: "City Bank",
        chequeNo: String(random.int(1_000_000, 9_999_999)),
        dueDate: dhakaDate(chequePurchase.time, 15),
      },
    };
  }
  events.push(...purchases);

  for (let i = 0; i < SUPPLIER_PAYMENTS; i++) {
    const method = paymentMethod(random, [
      ["bank", 60],
      ["cash", 40],
    ]);
    events.push({
      kind: "supplier_payment",
      time: shopTime(random, now, HISTORY_DAYS, 1),
      pickRoll: random.next(),
      fraction: 0.4 + 0.6 * random.next(),
      method,
      trxId: random.code(8),
    });
  }

  // Time order; events at the same moment keep the order they were drawn in.
  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.time.getTime() - b.event.time.getTime() || a.index - b.index)
    .map(({ event }) => event);

  solveOpeningStock(random, parts, ordered);

  const book = new Book(input.id, input.accounts, input.deviceId);
  for (const event of ordered) {
    if (event.kind === "sale") await book.sale(event);
    else if (event.kind === "void") await book.voidSale(event.sale);
    else if (event.kind === "return") {
      await book.saleReturn(
        event.sale,
        event.lineIndex,
        event.quantity,
        event.restock,
        event.reason,
        event.time,
      );
    } else if (event.kind === "purchase") await book.purchase(event);
    else if (event.kind === "customer_payment") await payCustomer(book, customers, event);
    else await paySupplier(book, suppliers, event);
  }

  // Anchors: the opening due that makes the final due exactly the listed one; every other customer stays low.
  for (const customer of customers) {
    if (customer.anchorDue !== null) {
      customer.opening = customer.anchorDue - customer.due;
      if (customer.opening < 0n)
        throw new Error(`seed history: ${customer.name} cannot end at its listed due`);
      customer.due = customer.anchorDue;
    } else {
      customer.opening = customer.provisionalOpening;
      if (customer.due >= OTHER_CUSTOMERS_MAX_DUE) {
        throw new Error(`seed history: ${customer.name} ends with a due of ${customer.due} taka`);
      }
    }
  }
  return { book, events: ordered.length };
}

/** Picks a customer with a due of at least 500 taka (larger dues more likely) and takes part of it. */
async function payCustomer(
  book: Book,
  customers: HistoryCustomer[],
  slot: CustomerPaymentSlot,
): Promise<void> {
  const candidates = customers.filter((c) => c.due >= 500n * TAKA);
  if (candidates.length === 0) return;
  const customer = pickByRoll(candidates, (c) => Number(c.due), slot.pickRoll);
  const amount = floorTo(BigInt(Math.floor(Number(customer.due) * slot.fraction)), 500n * TAKA);
  if (amount <= 0n) return;
  const plan: PaymentPlan =
    slot.method === "cheque"
      ? {
          method: "cheque",
          amount,
          trxId: null,
          cheque: {
            bank: slot.chequeBank,
            chequeNo: slot.chequeNo,
            dueDate: dhakaDate(slot.time, slot.chequeDays),
          },
        }
      : { method: slot.method, amount, trxId: slot.method === "cash" ? null : slot.trxId };
  await book.customerPayment(customer, plan, slot.time);
}

async function paySupplier(
  book: Book,
  suppliers: HistorySupplier[],
  slot: SupplierPaymentSlot,
): Promise<void> {
  const candidates = suppliers.filter((s) => s.payable >= 1000n * TAKA);
  if (candidates.length === 0) return;
  const supplier = pickByRoll(candidates, (s) => Number(s.payable), slot.pickRoll);
  const amount = floorTo(BigInt(Math.floor(Number(supplier.payable) * slot.fraction)), 1000n * TAKA);
  if (amount <= 0n) return;
  await book.supplierPayment(
    supplier,
    {
      method: slot.method,
      amount,
      trxId: slot.method === "cash" ? null : `TT${slot.trxId}`,
    },
    slot.time,
  );
}

function pickByRoll<T>(items: T[], weight: (item: T) => number, roll: number): T {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let target = roll * total;
  for (const item of items) {
    target -= weight(item);
    if (target < 0) return item;
  }
  const last = items[items.length - 1];
  if (last === undefined) throw new Error("pick from an empty list");
  return last;
}
