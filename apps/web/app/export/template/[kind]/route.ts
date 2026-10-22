import {
  IMPORT_KINDS,
  templateWorkbook,
  type ImportKind,
} from "../../../../src/server/services/excel-import";
import { currentUser } from "../../../../src/web/auth";
import { download, fileName } from "../../../../src/web/excel";

export const runtime = "nodejs";

/** GET /export/template/{parts|customers|suppliers}: the import template (GearGrid plan, appendix). */
export async function GET(_request: Request, context: { params: Promise<{ kind: string }> }) {
  if (!(await currentUser())) return new Response("Log in first.", { status: 401 });
  const { kind } = await context.params;
  if (!(IMPORT_KINDS as readonly string[]).includes(kind))
    return new Response("No such template.", { status: 404 });
  return download(await templateWorkbook(kind as ImportKind), fileName("geargrid-import", kind));
}
