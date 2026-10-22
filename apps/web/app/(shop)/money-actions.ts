"use server";

import { revalidatePath } from "next/cache";
import {
  accountEdit,
  accountInput,
  addAccount,
  addDefaultExpenseCategories,
  addExpense,
  addExpenseCategory,
  categoryInput,
  chequeAction,
  closeDay,
  closingInput,
  editAccount,
  expenseInput,
  moveCheque,
  paySupplier,
  supplierPaymentInput,
  transfer,
  transferInput,
} from "../../src/server/services/money";
import { addTrxId, trxInput } from "../../src/server/services/review";
import { adjustInput, adjustStock, countInput, countStock } from "../../src/server/services/stock";
import {
  checked,
  decimalOrNull,
  field,
  numberOrNull,
  ownerChange,
  textOrNull,
  type WebState,
} from "../../src/web/forms";
import { pageContext } from "../../src/web/page-context";

// Money and stock form actions (DokaanBondhu spec D193, C4): each checks the owner, parses the form and runs one
// service in one transaction.

const refresh = (...paths: string[]) => paths.forEach((path) => revalidatePath(path));

/** A number field as the services expect it: a whole number, or NaN so the form check names the field. */
const whole = (form: FormData, name: string) => {
  const value = numberOrNull(form, name);
  return value === null ? Number.NaN : value;
};

export async function paySupplierAction(_state: WebState, form: FormData): Promise<WebState> {
  const supplierId = field(form, "supplierId");
  const method = field(form, "method");
  const state = await ownerChange("supplier_pay.saved", (tx, actor) =>
    paySupplier(
      tx,
      actor,
      supplierPaymentInput.parse({
        supplierId,
        amount: whole(form, "amount"),
        method,
        accountId: textOrNull(form, "accountId"),
        trxId: field(form, "trxId"),
        cheque:
          method === "cheque"
            ? {
                bank: field(form, "chequeBank"),
                chequeNo: field(form, "chequeNo"),
                dueDate: field(form, "chequeDue"),
              }
            : null,
      }),
    ),
  );
  refresh(`/suppliers/${supplierId}`, "/suppliers", "/money", "/cheques", "/");
  return state;
}

export async function addAccountAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("money.added", (tx, actor) =>
    addAccount(
      tx,
      actor,
      accountInput.parse({
        name: field(form, "name"),
        kind: field(form, "kind"),
        number: field(form, "accountNumber"),
        openingBalance: numberOrNull(form, "openingBalance") ?? 0,
      }),
    ),
  );
  refresh("/money", "/");
  return state;
}

export async function editAccountAction(_state: WebState, form: FormData): Promise<WebState> {
  const id = field(form, "id");
  const state = await ownerChange("form.saved", (tx, actor) =>
    editAccount(
      tx,
      actor,
      id,
      accountEdit.parse({
        name: field(form, "name"),
        number: field(form, "accountNumber"),
        isActive: checked(form, "isActive"),
      }),
    ),
  );
  refresh("/money", `/money/${id}`, "/");
  return state;
}

export async function transferAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("money.transferred", (tx, actor) =>
    transfer(
      tx,
      actor,
      transferInput.parse({
        fromId: field(form, "fromId"),
        toId: field(form, "toId"),
        amount: whole(form, "amount"),
        note: field(form, "note"),
      }),
    ),
  );
  refresh("/money", "/");
  return state;
}

export async function closeDayAction(_state: WebState, form: FormData): Promise<WebState> {
  const accountId = field(form, "accountId");
  let difference = 0n;
  const state = await ownerChange("form.saved", async (tx, actor) => {
    const result = await closeDay(
      tx,
      actor,
      closingInput.parse({ accountId, date: field(form, "date"), counted: whole(form, "counted") }),
    );
    difference = result.difference;
  });
  refresh(`/money/${accountId}`);
  if (state.status !== "ok") return state;
  const { t, taka } = await pageContext();
  return { ...state, message: t("money.closed", { difference: taka(difference) }) };
}

export async function addExpenseAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("expenses.saved", (tx, actor) =>
    addExpense(
      tx,
      actor,
      expenseInput.parse({
        categoryId: field(form, "categoryId"),
        accountId: field(form, "accountId"),
        amount: whole(form, "amount"),
        note: field(form, "note"),
        date: field(form, "date"),
      }),
    ),
  );
  refresh("/expenses", "/money", "/");
  return state;
}

export async function addCategoryAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("form.added", (tx, actor) =>
    addExpenseCategory(
      tx,
      actor,
      categoryInput.parse({ nameEn: field(form, "nameEn"), nameBn: field(form, "nameBn") }),
    ),
  );
  refresh("/expenses");
  return state;
}

export async function addDefaultCategoriesAction(_state: WebState): Promise<WebState> {
  const state = await ownerChange("form.added", (tx, actor) => addDefaultExpenseCategories(tx, actor));
  refresh("/expenses");
  return state;
}

export async function moveChequeAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("form.saved", (tx, actor) =>
    moveCheque(
      tx,
      actor,
      chequeAction.parse({
        id: field(form, "id"),
        action: field(form, "action"),
        accountId: textOrNull(form, "accountId"),
      }),
    ),
  );
  refresh("/cheques", "/money", "/customers", "/suppliers", "/");
  return state;
}

export async function adjustStockAction(_state: WebState, form: FormData): Promise<WebState> {
  const partId = field(form, "partId");
  const state = await ownerChange("stock.adjusted", (tx, actor) =>
    adjustStock(
      tx,
      actor,
      adjustInput.parse({
        partId,
        change: field(form, "change")
          .replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)))
          .replace(/^−/, "-"),
        reason: field(form, "reason"),
        note: field(form, "note"),
      }),
    ),
  );
  refresh("/stock", `/parts/${partId}`, "/review");
  return state;
}

export async function countStockAction(_state: WebState, form: FormData): Promise<WebState> {
  const counts = form
    .getAll("partId")
    .map(String)
    .map((partId) => ({ partId, counted: decimalOrNull(form, `counted:${partId}`) }))
    .filter((count): count is { partId: string; counted: string } => count.counted !== null);
  let adjusted = 0;
  const state = await ownerChange("form.saved", async (tx, actor) => {
    adjusted = await countStock(tx, actor, countInput.parse({ counts }));
  });
  refresh("/stock", "/stock/count", "/review", "/parts");
  if (state.status !== "ok") return state;
  const { t } = await pageContext();
  return { ...state, message: t("stock.counted_saved", { count: adjusted }) };
}

export async function addTrxAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("review.trx_added", (tx, actor) =>
    addTrxId(
      tx,
      actor,
      trxInput.parse({ kind: field(form, "kind"), id: field(form, "id"), trxId: field(form, "trxId") }),
    ),
  );
  refresh("/review", "/sales", "/customers");
  return state;
}
