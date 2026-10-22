"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fitmentInput } from "../../src/openapi/registry";
import { addFitment, updateFitment } from "../../src/server/services/catalog";
import {
  addAlias,
  addPartNumber,
  addVehicle,
  aliasInput,
  createPart,
  partInput,
  partNumberInput,
  removeAlias,
  removePartNumber,
  updatePart,
  vehicleInput,
} from "../../src/server/services/catalog-edit";
import {
  checked,
  decimalOrNull,
  field,
  numberOrNull,
  ownerChange,
  textOrNull,
  type WebState,
} from "../../src/web/forms";

// The catalog's form actions (DokaanBondhu spec D193, C2). Each checks the owner's login, parses the form and runs
// one service in one transaction; a new part or vehicle opens its page only after the save has committed.

function partFields(form: FormData) {
  return partInput.parse({
    nameEn: field(form, "nameEn"),
    nameBn: field(form, "nameBn"),
    categoryId: field(form, "categoryId"),
    brandId: textOrNull(form, "brandId"),
    newBrand: field(form, "newBrand"),
    vehicleType: field(form, "vehicleType"),
    quality: field(form, "quality"),
    position: textOrNull(form, "position"),
    unit: field(form, "unit"),
    packSize: decimalOrNull(form, "packSize"),
    rackLocation: field(form, "rackLocation"),
    retailPrice: numberOrNull(form, "retailPrice"),
    garagePrice: numberOrNull(form, "garagePrice"),
    reorderLevel: decimalOrNull(form, "reorderLevel") ?? "0",
    notes: field(form, "notes"),
    isActive: checked(form, "isActive"),
  });
}

export async function createPartAction(_state: WebState, form: FormData): Promise<WebState> {
  let id = "";
  const state = await ownerChange("form.saved", async (tx, actor) => {
    id = await createPart(tx, actor, partFields(form), textOrNull(form, "mainNumber"));
  });
  if (state.status === "ok") redirect(`/parts/${id}`);
  return state;
}

export async function updatePartAction(_state: WebState, form: FormData): Promise<WebState> {
  const id = field(form, "partId");
  const state = await ownerChange("form.saved", (tx, actor) => updatePart(tx, actor, id, partFields(form)));
  if (state.status === "ok") redirect(`/parts/${id}`);
  return state;
}

function refreshPart(form: FormData) {
  revalidatePath(`/parts/${field(form, "partId")}`);
}

export async function addNumberAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("form.added", (tx, actor) =>
    addPartNumber(
      tx,
      actor,
      field(form, "partId"),
      partNumberInput.parse({
        number: field(form, "number"),
        kind: field(form, "kind"),
        brand: field(form, "brand"),
        isMain: checked(form, "isMain"),
      }),
    ),
  );
  refreshPart(form);
  return state;
}

export async function removeNumberAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("form.removed", (tx, actor) =>
    removePartNumber(tx, actor, field(form, "id")),
  );
  refreshPart(form);
  return state;
}

export async function addAliasAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("form.added", (tx, actor) =>
    addAlias(
      tx,
      actor,
      aliasInput.parse({
        aliasText: field(form, "aliasText"),
        partId: textOrNull(form, "partId"),
        categoryId: textOrNull(form, "categoryId"),
      }),
    ),
  );
  if (field(form, "partId")) refreshPart(form);
  revalidatePath("/aliases");
  return state;
}

export async function removeAliasAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("form.removed", (tx, actor) => removeAlias(tx, actor, field(form, "id")));
  if (field(form, "partId")) refreshPart(form);
  revalidatePath("/aliases");
  return state;
}

/** The API's own fitment add and remove (spec 6.5), so the web follows the same rules as DokaanBondhu. */
export async function addFitmentAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("form.added", (tx, actor) =>
    addFitment({
      tx,
      actor,
      now: new Date(),
      params: undefined,
      query: undefined,
      dryRun: false,
      body: fitmentInput.parse({
        part_id: field(form, "partId"),
        vehicle_id: field(form, "vehicleId"),
        ...(field(form, "note") ? { note: field(form, "note") } : {}),
        verified: checked(form, "verified"),
      }),
    }),
  );
  refreshPart(form);
  return state;
}

export async function removeFitmentAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("form.removed", (tx, actor) =>
    updateFitment({
      tx,
      actor,
      now: new Date(),
      params: { id: field(form, "id") },
      query: undefined,
      dryRun: false,
      body: { deleted: true },
    }),
  );
  refreshPart(form);
  return state;
}

export async function addVehicleAction(_state: WebState, form: FormData): Promise<WebState> {
  const state = await ownerChange("form.added", (tx, actor) =>
    addVehicle(
      tx,
      actor,
      vehicleInput.parse({
        vehicleType: field(form, "vehicleType"),
        make: field(form, "make"),
        model: field(form, "model"),
        yearFrom: numberOrNull(form, "yearFrom"),
        yearTo: numberOrNull(form, "yearTo"),
        engineCode: field(form, "engineCode"),
        body: field(form, "body"),
      }),
    ),
  );
  revalidatePath("/vehicles");
  return state;
}
