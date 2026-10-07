import {
  formatInvoiceNo,
  formatQuantity,
  lineValue,
  newAverageCost,
  returnTotal,
  type PriceTier,
} from "@geargrid/core";
import type {
  accountTransactions,
  cheques,
  customerLedger,
  customerPayments,
  PAYMENT_METHODS,
  purchaseItems,
  purchases,
  returnItems,
  returns,
  saleItems,
  salePayments,
  sales,
  stockMovements,
  supplierLedger,
  supplierPayments,
} from "@geargrid/db";

// The posting rules of spec 6.6, applied in memory to the seed's history. The API posts the same rules inside its
// transactions (apps/web/src/server/posting); the seed keeps this in-memory book, because it builds a whole history
// before the opening dues are known, and shares the calculations of packages/core with the API (DokaanBondhu spec
// D131). db:check guards both.

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
type Row<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export interface PartRef {
  id: string;
  number: string;
  avgCost: bigint; // whole taka; changes with every purchase
  stock: bigint; // milli-units
}

export interface CustomerRef {
  id: string;
  name: string;
  due: bigint; // running due during the history, counted from the provisional opening
}

export interface SupplierRef {
  id: string;
  payable: bigint;
}

export interface AccountRefs {
  byMethod: (method: Exclude<PaymentMethod, "cheque">) => string;
  cash: string;
}

export interface PaymentPlan {
  method: PaymentMethod;
  amount: bigint;
  trxId: string | null;
  cheque?: { bank: string; chequeNo: string; dueDate: string };
}

export interface SaleLine {
  part: PartRef;
  quantity: bigint; // milli-units
  unitPrice: bigint;
  tier: PriceTier;
}

export interface SaleEvent {
  kind: "sale";
  time: Date;
  customer: CustomerRef | null;
  lines: SaleLine[];
  subtotal: bigint;
  discount: bigint;
  roundOff: bigint;
  total: bigint;
  paid: bigint;
  due: bigint;
  payments: PaymentPlan[];
  note: string | null;
  voided?: { time: Date; reason: string };
  posted?: {
    id: string;
    items: { id: string; unitCost: bigint }[];
    payments: { accountId: string | null; amount: bigint }[];
  };
}

export interface PurchaseLine {
  part: PartRef;
  quantity: bigint;
  unitCost: bigint;
}

export interface PurchaseEvent {
  kind: "purchase";
  time: Date;
  supplier: SupplierRef;
  billNo: string;
  lines: PurchaseLine[];
  payments: PaymentPlan[];
}

type LedgerDraft<T> = T & { provisionalBalance: bigint };

export type IdOf = (key: string) => Promise<string>;

/** Collects every row the history writes, applying the posting rules as it goes. */
export class Book {
  readonly sales: Row<typeof sales>[] = [];
  readonly saleItems: Row<typeof saleItems>[] = [];
  readonly salePayments: Row<typeof salePayments>[] = [];
  readonly customerPayments: Row<typeof customerPayments>[] = [];
  readonly returns: Row<typeof returns>[] = [];
  readonly returnItems: Row<typeof returnItems>[] = [];
  readonly purchases: Row<typeof purchases>[] = [];
  readonly purchaseItems: Row<typeof purchaseItems>[] = [];
  readonly supplierPayments: Row<typeof supplierPayments>[] = [];
  readonly cheques: Row<typeof cheques>[] = [];
  readonly stockMovements: Row<typeof stockMovements>[] = [];
  readonly accountTransactions: Row<typeof accountTransactions>[] = [];
  readonly customerLedger: LedgerDraft<Row<typeof customerLedger>>[] = [];
  readonly supplierLedger: LedgerDraft<Row<typeof supplierLedger>>[] = [];

  private readonly counters = new Map<string, number>();

  constructor(
    private readonly id: IdOf,
    private readonly accounts: AccountRefs,
    private readonly deviceId: string,
  ) {}

  private next(kind: string): number {
    const value = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, value);
    return value;
  }

  private stamp(time: Date) {
    return { createdAt: time, updatedAt: time };
  }

  async movement(
    part: PartRef,
    change: bigint,
    reason: string,
    refType: string | null,
    refId: string | null,
    unitCost: bigint,
    time: Date,
  ): Promise<void> {
    part.stock += change;
    this.stockMovements.push({
      id: await this.id(`movement:${this.next("movement")}`),
      partId: part.id,
      qtyChange: formatQuantity(change),
      reason,
      refType,
      refId,
      unitCost,
      ...this.stamp(time),
    });
  }

  private async account(
    accountId: string,
    direction: "in" | "out",
    amount: bigint,
    refType: string,
    refId: string,
    time: Date,
  ): Promise<void> {
    this.accountTransactions.push({
      id: await this.id(`account_tx:${this.next("account_tx")}`),
      accountId,
      direction,
      amount,
      refType,
      refId,
      ...this.stamp(time),
    });
  }

  private async customerEntry(
    customer: CustomerRef,
    entryType: string,
    refType: string,
    refId: string,
    debit: bigint,
    credit: bigint,
    time: Date,
  ): Promise<void> {
    customer.due += debit - credit;
    if (customer.due < 0n) throw new Error(`seed history: ${customer.name}'s due would go below zero`);
    this.customerLedger.push({
      id: await this.id(`customer_ledger:${this.next("customer_ledger")}`),
      customerId: customer.id,
      entryType,
      refType,
      refId,
      debit,
      credit,
      balanceAfter: 0n, // set from provisionalBalance once the opening due is known
      provisionalBalance: customer.due,
      ...this.stamp(time),
    });
  }

  private async supplierEntry(
    supplier: SupplierRef,
    entryType: string,
    refType: string,
    refId: string,
    debit: bigint,
    credit: bigint,
    time: Date,
  ): Promise<void> {
    supplier.payable += debit - credit;
    if (supplier.payable < 0n) throw new Error("seed history: a supplier's payable would go below zero");
    this.supplierLedger.push({
      id: await this.id(`supplier_ledger:${this.next("supplier_ledger")}`),
      supplierId: supplier.id,
      entryType,
      refType,
      refId,
      debit,
      credit,
      balanceAfter: 0n,
      provisionalBalance: supplier.payable,
      ...this.stamp(time),
    });
  }

  private async cheque(
    direction: "received" | "issued",
    partyType: "customer" | "supplier",
    partyId: string,
    plan: PaymentPlan,
    time: Date,
  ): Promise<string> {
    if (!plan.cheque) throw new Error("seed history: cheque details missing");
    const chequeId = await this.id(`cheque:${this.next("cheque")}`);
    this.cheques.push({
      id: chequeId,
      direction,
      partyType,
      partyId,
      bank: plan.cheque.bank,
      chequeNo: plan.cheque.chequeNo,
      amount: plan.amount,
      dueDate: plan.cheque.dueDate,
      status: "pending",
      ...this.stamp(time),
    });
    return chequeId;
  }

  /** Sale: stock out per line; with a customer, ledger sale (debit total) and sale_payment (credit paid). */
  async sale(event: SaleEvent): Promise<void> {
    const n = this.next("sale");
    const saleId = await this.id(`sale:${n}`);
    this.sales.push({
      id: saleId,
      invoiceNo: formatInvoiceNo({ device: 1 }, n),
      deviceId: this.deviceId,
      customerId: event.customer?.id ?? null,
      saleTime: event.time,
      subtotal: event.subtotal,
      discount: event.discount,
      total: event.total,
      paid: event.paid,
      due: event.due,
      roundOff: event.roundOff,
      note: event.note,
      ...this.stamp(event.time),
    });
    const posted: NonNullable<SaleEvent["posted"]> = { id: saleId, items: [], payments: [] };
    for (const [index, line] of event.lines.entries()) {
      const itemId = await this.id(`sale_item:${n}:${index + 1}`);
      const unitCost = line.part.avgCost;
      this.saleItems.push({
        id: itemId,
        saleId,
        partId: line.part.id,
        quantity: formatQuantity(line.quantity),
        unitPrice: line.unitPrice,
        listPrice: line.unitPrice,
        lineTotal: lineValue(line.quantity, line.unitPrice),
        unitCostAtSale: unitCost,
        priceTier: line.tier,
        ...this.stamp(event.time),
      });
      posted.items.push({ id: itemId, unitCost });
      await this.movement(line.part, -line.quantity, "sale", "sale", saleId, unitCost, event.time);
    }
    if (event.customer) {
      await this.customerEntry(event.customer, "sale", "sale", saleId, event.total, 0n, event.time);
      if (event.paid > 0n) {
        await this.customerEntry(event.customer, "sale_payment", "sale", saleId, 0n, event.paid, event.time);
      }
    }
    for (const [index, plan] of event.payments.entries()) {
      if (plan.method === "cheque" && !event.customer)
        throw new Error("seed history: a cheque needs a customer");
      const chequeId =
        plan.method === "cheque" && event.customer
          ? await this.cheque("received", "customer", event.customer.id, plan, event.time)
          : null;
      const accountId = plan.method === "cheque" ? null : this.accounts.byMethod(plan.method);
      this.salePayments.push({
        id: await this.id(`sale_payment:${n}:${index + 1}`),
        saleId,
        accountId,
        method: plan.method,
        amount: plan.amount,
        trxId: plan.trxId,
        chequeId,
        ...this.stamp(event.time),
      });
      if (accountId) await this.account(accountId, "in", plan.amount, "sale", saleId, event.time);
      posted.payments.push({ accountId, amount: plan.amount });
    }
    event.posted = posted;
  }

  /** Void: stock back per line; ledger void (credit total) and void_payment (debit paid); money back out. */
  async voidSale(event: SaleEvent): Promise<void> {
    const posted = event.posted;
    const voided = event.voided;
    if (!posted || !voided) throw new Error("seed history: void before its sale");
    const saleRow = this.sales.find((row) => row.id === posted.id);
    if (!saleRow) throw new Error("seed history: voided sale not found");
    Object.assign(saleRow, {
      status: "void",
      voidReason: voided.reason,
      voidedAt: voided.time,
      updatedAt: voided.time,
      version: 2,
    });
    for (const [index, line] of event.lines.entries()) {
      const item = posted.items[index];
      if (!item) throw new Error("seed history: sale line missing");
      await this.movement(line.part, line.quantity, "void", "sale", posted.id, item.unitCost, voided.time);
    }
    if (event.customer) {
      await this.customerEntry(event.customer, "void", "sale", posted.id, 0n, event.total, voided.time);
      if (event.paid > 0n) {
        await this.customerEntry(
          event.customer,
          "void_payment",
          "sale",
          posted.id,
          event.paid,
          0n,
          voided.time,
        );
      }
    }
    for (const payment of posted.payments) {
      if (payment.accountId)
        await this.account(payment.accountId, "out", payment.amount, "sale", posted.id, voided.time);
    }
  }

  /** Customer payment: ledger payment (credit); money in, or a pending received cheque. */
  async customerPayment(customer: CustomerRef, plan: PaymentPlan, time: Date): Promise<void> {
    const n = this.next("customer_payment");
    const paymentId = await this.id(`customer_payment:${n}`);
    const chequeId =
      plan.method === "cheque" ? await this.cheque("received", "customer", customer.id, plan, time) : null;
    const accountId = plan.method === "cheque" ? null : this.accounts.byMethod(plan.method);
    this.customerPayments.push({
      id: paymentId,
      customerId: customer.id,
      accountId,
      amount: plan.amount,
      method: plan.method,
      trxId: plan.trxId,
      chequeId,
      receivedAt: time,
      ...this.stamp(time),
    });
    await this.customerEntry(customer, "payment", "customer_payment", paymentId, 0n, plan.amount, time);
    if (accountId) await this.account(accountId, "in", plan.amount, "customer_payment", paymentId, time);
  }

  /**
   * Return of part of a sale line. Its value shares out the discount and round-off (D27); the refund lowers the
   * due first, by at most the current due, and the rest is paid in cash.
   */
  async saleReturn(
    event: SaleEvent,
    lineIndex: number,
    quantity: bigint,
    restock: "yes" | "damaged",
    reason: string,
    time: Date,
  ): Promise<void> {
    const posted = event.posted;
    const line = event.lines[lineIndex];
    const item = posted?.items[lineIndex];
    if (!posted || !line || !item) throw new Error("seed history: return before its sale");
    const total = returnTotal([{ quantityMilli: quantity, unitPrice: line.unitPrice }], event);
    const currentDue = event.customer?.due ?? 0n;
    const refundDue = total < currentDue ? total : currentDue;
    const refundCash = total - refundDue;
    const n = this.next("return");
    const returnId = await this.id(`return:${n}`);
    this.returns.push({
      id: returnId,
      saleId: posted.id,
      customerId: event.customer?.id ?? null,
      returnTime: time,
      total,
      refundDue,
      refundCash,
      accountId: refundCash > 0n ? this.accounts.cash : null,
      reason,
      ...this.stamp(time),
    });
    this.returnItems.push({
      id: await this.id(`return_item:${n}:1`),
      returnId,
      saleItemId: item.id,
      partId: line.part.id,
      quantity: formatQuantity(quantity),
      unitPrice: line.unitPrice,
      restock,
      ...this.stamp(time),
    });
    if (restock === "yes")
      await this.movement(line.part, quantity, "return", "return", returnId, item.unitCost, time);
    if (event.customer && refundDue > 0n) {
      await this.customerEntry(event.customer, "return", "return", returnId, 0n, refundDue, time);
    }
    if (refundCash > 0n) await this.account(this.accounts.cash, "out", refundCash, "return", returnId, time);
  }

  /** Purchase: new average cost, then stock in, per line; ledger purchase (debit total), purchase_payment (credit). */
  async purchase(event: PurchaseEvent): Promise<void> {
    const n = this.next("purchase");
    const purchaseId = await this.id(`purchase:${n}`);
    const total = event.lines.reduce((sum, line) => sum + lineValue(line.quantity, line.unitCost), 0n);
    const paid = event.payments.reduce((sum, plan) => sum + plan.amount, 0n);
    this.purchases.push({
      id: purchaseId,
      supplierId: event.supplier.id,
      billNo: event.billNo,
      purchaseTime: event.time,
      total,
      paid,
      due: total - paid,
      ...this.stamp(event.time),
    });
    for (const [index, line] of event.lines.entries()) {
      const avgCostBefore = line.part.avgCost; // saved on the line for a reversal (spec D93)
      line.part.avgCost = newAverageCost(line.part.stock, line.part.avgCost, line.quantity, line.unitCost);
      this.purchaseItems.push({
        id: await this.id(`purchase_item:${n}:${index + 1}`),
        purchaseId,
        partId: line.part.id,
        quantity: formatQuantity(line.quantity),
        unitCost: line.unitCost,
        lineTotal: lineValue(line.quantity, line.unitCost),
        avgCostBefore,
        ...this.stamp(event.time),
      });
      await this.movement(
        line.part,
        line.quantity,
        "purchase",
        "purchase",
        purchaseId,
        line.unitCost,
        event.time,
      );
    }
    await this.supplierEntry(event.supplier, "purchase", "purchase", purchaseId, total, 0n, event.time);
    for (const plan of event.payments) {
      await this.supplierPayment(event.supplier, plan, event.time, purchaseId);
    }
  }

  /** Supplier payment, with a purchase (purchase_payment) or on its own (payment): money out or an issued cheque. */
  async supplierPayment(
    supplier: SupplierRef,
    plan: PaymentPlan,
    time: Date,
    purchaseId: string | null = null,
  ): Promise<void> {
    const paymentId = await this.id(`supplier_payment:${this.next("supplier_payment")}`);
    const chequeId =
      plan.method === "cheque" ? await this.cheque("issued", "supplier", supplier.id, plan, time) : null;
    const accountId = plan.method === "cheque" ? null : this.accounts.byMethod(plan.method);
    this.supplierPayments.push({
      id: paymentId,
      supplierId: supplier.id,
      purchaseId,
      accountId,
      amount: plan.amount,
      method: plan.method,
      trxId: plan.trxId,
      chequeId,
      paidAt: time,
      ...this.stamp(time),
    });
    const entryType = purchaseId ? "purchase_payment" : "payment";
    await this.supplierEntry(supplier, entryType, "supplier_payment", paymentId, 0n, plan.amount, time);
    if (accountId) await this.account(accountId, "out", plan.amount, "supplier_payment", paymentId, time);
  }
}
