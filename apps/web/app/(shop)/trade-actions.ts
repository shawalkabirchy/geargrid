"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { customerPaymentInput, purchaseInput, returnInput, saleInput } from "../../src/openapi/registry";
import { database, type Tx } from "../../src/server/db";
import bnMessages from "../../src/server/http/messages/bn.json";
import enMessages from "../../src/server/http/messages/en.json";
import type { Answer } from "../../src/server/http/pipeline";
import type { AuditActor } from "../../src/server/posting";
import { searchParts } from "../../src/server/services/catalog-reads";
import { receivePayment, reversePayment } from "../../src/server/services/payments";
import { reversePurchase, stockIn } from "../../src/server/services/purchases";
import { recordReturn } from "../../src/server/services/returns";
import { createSale, voidSale } from "../../src/server/services/sales";
import { requireUser, webActor } from "../../src/web/auth";
import {
  field,
  isRedirect,
  numberOrNull,
  ownerChange,
  refusal,
  requireOwner,
  type WebState,
} from "../../src/web/forms";
import { pageContext } from "../../src/web/page-context";

// Selling and buying on the web dashboard (DokaanBondhu spec D193, C3). Every write is the API's own service, so the
// postings, ledgers, warnings and refusals are exactly those of /api/v1. A sale or a purchase is first run as a dry
// run: its warnings (low stock, a passed credit limit, a missing TrxID) are shown, and it is saved once the owner
// accepts them. A web sale's invoice number starts with W- (spec 5.1).

const context = <B, P = undefined>(body: B, params?: P) => ({
  now: new Date(),
  params: params as P,
  query: undefined,
  dryRun: false,
  body,
});

/** Runs a service as a dry run: everything is written, then rolled back. */
class Rollback extends Error {
  constructor(readonly answer: Answer) {
    super("dry run");
  }
}

async function dryRun(
  run: (tx: Tx, actor: AuditActor) => Promise<Answer>,
  actor: AuditActor,
): Promise<Answer> {
  try {
    await database().transaction(async (tx) => {
      throw new Rollback(await run(tx, actor));
    });
  } catch (error) {
    if (error instanceof Rollback) return error.answer;
    throw error;
  }
  throw new Error("unreachable");
}

async function warningTexts(answer: Answer): Promise<string[]> {
  const { language } = await pageContext();
  const texts = (language === "en" ? enMessages : bnMessages).warnings as Record<string, string>;
  return ((answer.body.warnings as { code: string }[] | undefined) ?? []).map((w) => texts[w.code] ?? w.code);
}

export type PartChoice = {
  id: string;
  name: string;
  number: string | null;
  unit: string;
  stock: string;
  rack: string | null;
  retail: string;
  garage: string | null;
  is_active: boolean;
};

/** The part picker of the sale and purchase forms. */
export async function findPartsAction(query: string): Promise<PartChoice[]> {
  await requireUser();
  if (query.trim().length < 2) return [];
  const hits = await searchParts(database(), query.slice(0, 100));
  return hits.slice(0, 15).map((hit) => ({
    id: hit.id,
    name: hit.name_bn ?? hit.name_en,
    number: hit.main_number,
    unit: hit.unit,
    stock: hit.stock,
    rack: hit.rack_location,
    retail: hit.retail_price,
    garage: hit.garage_price,
    is_active: hit.is_active,
  }));
}

export type CheckedSave = { status: "warnings"; warnings: string[] } | { status: "error"; message: string };

/** Checks (dry run) and, with no warnings or once they are accepted, saves; then opens the new record's page. */
async function checkedSave(
  payload: unknown,
  confirmed: boolean,
  parse: (payload: unknown) => unknown,
  run: (tx: Tx, actor: AuditActor, body: never, dry: boolean) => Promise<Answer>,
  pageOf: (answer: Answer) => string,
  refresh: string[],
): Promise<CheckedSave> {
  let page: string;
  try {
    const user = await requireOwner();
    const actor = webActor(user);
    const body = parse(payload) as never;
    if (!confirmed) {
      const checked = await dryRun((tx) => run(tx, actor, body, true), actor);
      const warnings = await warningTexts(checked);
      if (warnings.length > 0) return { status: "warnings", warnings };
    }
    const answer = await database().transaction((tx) => run(tx, actor, body, false), {
      isolationLevel: "read committed",
    });
    page = pageOf(answer);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { status: "error", message: await refusal(error) };
  }
  for (const path of refresh) revalidatePath(path);
  redirect(page);
}

export async function saveSaleAction(payload: unknown, confirmed: boolean): Promise<CheckedSave> {
  return checkedSave(
    payload,
    confirmed,
    (p) => saleInput.parse(p),
    (tx, actor, body, dry) => createSale({ tx, actor, ...context(body), dryRun: dry }),
    (answer) => `/sales/${(answer.body.sale as { id: string }).id}`,
    ["/", "/sales", "/customers"],
  );
}

export async function savePurchaseAction(payload: unknown, confirmed: boolean): Promise<CheckedSave> {
  return checkedSave(
    payload,
    confirmed,
    (p) => purchaseInput.parse(p),
    (tx, actor, body, dry) => stockIn({ tx, actor, ...context(body), dryRun: dry }),
    (answer) => `/purchases/${(answer.body.purchase as { id: string }).id}`,
    ["/", "/purchases", "/suppliers", "/parts"],
  );
}

const reason = z.object({ reason: z.string().trim().min(1).max(200) });

export async function voidSaleAction(_state: WebState, form: FormData): Promise<WebState> {
  const id = field(form, "id");
  const state = await ownerChange("form.saved", (tx, actor) =>
    voidSale({ tx, actor, ...context(reason.parse({ reason: field(form, "reason") }), { id }) }),
  );
  revalidatePath(`/sales/${id}`);
  revalidatePath("/sales");
  return state;
}

export async function reversePurchaseAction(_state: WebState, form: FormData): Promise<WebState> {
  const id = field(form, "id");
  let warnings: string[] = [];
  const state = await ownerChange("form.saved", async (tx, actor) => {
    const answer = await reversePurchase({
      tx,
      actor,
      ...context(reason.parse({ reason: field(form, "reason") }), { id }),
    });
    warnings = await warningTexts(answer);
  });
  revalidatePath(`/purchases/${id}`);
  revalidatePath("/purchases");
  return warnings.length > 0 && state.status === "ok" ? { ...state, message: warnings.join(" ") } : state;
}

export type ReturnPreview =
  { status: "ok"; total: number; customerDue: number | null } | { status: "error"; message: string };

/** The return's value before the refund is split (the API's dry run without the refund, spec 6.5). */
export async function previewReturnAction(payload: unknown): Promise<ReturnPreview> {
  try {
    const user = await requireOwner();
    const body = returnInput.parse(payload);
    const answer = await dryRun(
      (tx, actor) => recordReturn({ tx, actor, ...context(body), dryRun: true }),
      webActor(user),
    );
    const view = answer.body.return as { total_taka: number };
    const customer = answer.body.customer as { due_balance_taka: number } | null;
    return { status: "ok", total: view.total_taka, customerDue: customer?.due_balance_taka ?? null };
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { status: "error", message: await refusal(error) };
  }
}

export async function saveReturnAction(payload: unknown): Promise<{ status: "error"; message: string }> {
  let saleId: string;
  try {
    const user = await requireOwner();
    const body = returnInput.parse(payload);
    saleId = body.sale_id;
    await database().transaction((tx) => recordReturn({ tx, actor: webActor(user), ...context(body) }), {
      isolationLevel: "read committed",
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { status: "error", message: await refusal(error) };
  }
  for (const path of ["/", `/sales/${saleId}`, "/customers"]) revalidatePath(path);
  redirect(`/sales/${saleId}`);
}

/** A customer's payment from the customer page (the API's own rules: never more than the due, D26). */
export async function receivePaymentAction(_state: WebState, form: FormData): Promise<WebState> {
  const customerId = field(form, "customerId");
  const method = field(form, "method");
  let warnings: string[] = [];
  const state = await ownerChange("payment.saved", async (tx, actor) => {
    const body = customerPaymentInput.parse({
      customer_id: customerId,
      method,
      amount_taka: numberOrNull(form, "amount"),
      ...(field(form, "accountId") ? { account_id: field(form, "accountId") } : {}),
      ...(field(form, "trxId") ? { trx_id: field(form, "trxId") } : {}),
      ...(method === "cheque"
        ? {
            cheque: {
              bank: field(form, "chequeBank"),
              cheque_no: field(form, "chequeNo"),
              due_date: field(form, "chequeDue"),
            },
          }
        : {}),
    });
    warnings = await warningTexts(await receivePayment({ tx, actor, ...context(body) }));
  });
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/");
  return warnings.length > 0 && state.status === "ok"
    ? { ...state, message: `${state.message} ${warnings.join(" ")}` }
    : state;
}

export async function reversePaymentAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("payment.reversed", (tx, actor) =>
    reversePayment({
      tx,
      actor,
      ...context(reason.parse({ reason: field(form, "reason") }), { id: field(form, "id") }),
    }),
  );
  revalidatePath(`/customers/${field(form, "customerId")}`);
  return state;
}
