"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { customerInput, partyChange, supplierInput } from "../../src/openapi/registry";
import {
  addCustomer,
  addSupplier,
  editCustomer,
  updateCustomer,
  updateSupplier,
} from "../../src/server/services/parties";
import { field, numberOrNull, ownerChange, textOrNull, type WebState } from "../../src/web/forms";

// Customers' and suppliers' form actions (DokaanBondhu spec D193, C2). Adding and removing use the API's own services
// and checks (D173: a customer or supplier with anything in the ledger is never removed).

const optional = (form: FormData, name: string) => (field(form, name) ? { [name]: field(form, name) } : {});

const context = <B, P = undefined>(body: B, params?: P) => ({
  now: new Date(),
  params: params as P,
  query: undefined,
  dryRun: false,
  body,
});

export async function addCustomerAction(_state: WebState, form: FormData): Promise<WebState> {
  let id = "";
  const state = await ownerChange("form.saved", async (tx, actor) => {
    const body = customerInput.parse({
      name: field(form, "name"),
      type: field(form, "type"),
      ...optional(form, "phone"),
      ...optional(form, "address"),
      credit_limit_taka: numberOrNull(form, "creditLimit"),
    });
    const answer = await addCustomer({ tx, actor, ...context(body) });
    id = (answer.body.customer as { id: string }).id;
  });
  if (state.status === "ok") redirect(`/customers/${id}`);
  return state;
}

const customerEdit = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\- ]{6,20}$/)
    .nullable(),
  address: z.string().trim().min(1).max(300).nullable(),
  price_tier: z.enum(["retail", "garage"]),
  credit_limit_taka: z.number().int().nonnegative().nullable(),
});

export async function editCustomerAction(_state: WebState, form: FormData): Promise<WebState> {
  const id = field(form, "id");
  const state = await ownerChange("form.saved", (tx, actor) =>
    editCustomer(
      tx,
      actor,
      id,
      customerEdit.parse({
        name: field(form, "name"),
        phone: textOrNull(form, "phone"),
        address: textOrNull(form, "address"),
        price_tier: field(form, "priceTier"),
        credit_limit_taka: numberOrNull(form, "creditLimit"),
      }),
    ),
  );
  revalidatePath(`/customers/${id}`);
  return state;
}

export async function removeCustomerAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("form.removed", (tx, actor) =>
    updateCustomer({ tx, actor, ...context({ deleted: true as const }, { id: field(form, "id") }) }),
  );
  if (state.status === "ok") redirect("/customers");
  return state;
}

export async function addSupplierAction(_state: WebState, form: FormData): Promise<WebState> {
  let id = "";
  const state = await ownerChange("form.saved", async (tx, actor) => {
    const body = supplierInput.parse({
      name: field(form, "name"),
      ...optional(form, "phone"),
      ...optional(form, "address"),
    });
    const answer = await addSupplier({ tx, actor, ...context(body) });
    id = (answer.body.supplier as { id: string }).id;
  });
  if (state.status === "ok") redirect(`/suppliers/${id}`);
  return state;
}

export async function editSupplierAction(_state: WebState, form: FormData): Promise<WebState> {
  const id = field(form, "id");
  const state = await ownerChange("form.saved", (tx, actor) =>
    updateSupplier({
      tx,
      actor,
      ...context(
        partyChange.parse({
          name: field(form, "name"),
          ...optional(form, "phone"),
          ...optional(form, "address"),
        }),
        { id },
      ),
    }),
  );
  revalidatePath(`/suppliers/${id}`);
  return state;
}

export async function removeSupplierAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("form.removed", (tx, actor) =>
    updateSupplier({ tx, actor, ...context({ deleted: true as const }, { id: field(form, "id") }) }),
  );
  if (state.status === "ok") redirect("/suppliers");
  return state;
}
