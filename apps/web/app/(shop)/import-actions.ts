"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cancelImport,
  confirmImport,
  createPreview,
  IMPORT_KINDS,
  MAX_BYTES,
  readWorkbook,
  TEMPLATES,
  type ImportKind,
} from "../../src/server/services/excel-import";
import { field, isRedirect, ownerChange, refusal, requireOwner, type WebState } from "../../src/web/forms";
import { pageContext } from "../../src/web/page-context";

// The Excel import wizard's actions (DokaanBondhu spec D193, C5): upload and check (a preview), confirm, cancel.

export async function uploadImportAction(_state: WebState, form: FormData): Promise<WebState> {
  let id = "";
  try {
    await requireOwner(); // before reading anything from the file
    const { t } = await pageContext();
    const kind = field(form, "kind") as ImportKind;
    const file = form.get("file");
    if (!(IMPORT_KINDS as readonly string[]).includes(kind))
      return { status: "error", message: t("import.no_kind") };
    if (!(file instanceof File) || file.size === 0) return { status: "error", message: t("import.no_file") };
    if (file.size > MAX_BYTES) return { status: "error", message: t("import.too_big") };
    const read = await readWorkbook(await file.arrayBuffer());
    if (!read.ok) return { status: "error", message: t(`import.file.${read.code}`) };
    const needed = TEMPLATES[kind][0]![0];
    if (!read.headers.includes(needed)) {
      return { status: "error", message: t("import.missing_column", { column: needed }) };
    }
    const state = await ownerChange("form.saved", async (tx, actor) => {
      id = await createPreview(tx, actor, kind, file.name, read.rows);
    });
    if (state.status !== "ok") return state;
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { status: "error", message: await refusal(error) };
  }
  revalidatePath("/import");
  redirect(`/import/${id}`);
}

export async function confirmImportAction(_state: WebState, form: FormData): Promise<WebState> {
  const id = field(form, "id");
  const state = await ownerChange("import.done", (tx, actor) => confirmImport(tx, actor, id));
  revalidatePath(`/import/${id}`);
  revalidatePath("/import");
  return state;
}

export async function cancelImportAction(_state: WebState, form: FormData): Promise<WebState> {
  const id = field(form, "id");
  const state = await ownerChange("import.cancelled", (tx, actor) => cancelImport(tx, actor, id));
  revalidatePath(`/import/${id}`);
  revalidatePath("/import");
  return state;
}
