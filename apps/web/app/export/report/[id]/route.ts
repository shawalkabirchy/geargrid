import { currentUser } from "../../../../src/web/auth";
import { download, fileName, reportWorkbook } from "../../../../src/web/excel";
import { pageContext } from "../../../../src/web/page-context";
import { REPORTS, reportParams } from "../../../../src/web/reports";

export const runtime = "nodejs";

/** GET /export/report/{id}: the report the page shows, as an Excel file (GearGrid plan 2.11). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response("Log in first.", { status: 401 });
  const { id } = await context.params;
  const def = REPORTS.find((report) => report.id === id);
  if (!def) return new Response("No such report.", { status: 404 });
  const params = reportParams(def, Object.fromEntries(new URL(request.url).searchParams));
  const page = await pageContext();
  const result = await def.build(page, params);
  const buffer = await reportWorkbook(page.settings.shopName, result);
  return download(buffer, fileName(def.id, params.from, params.to));
}
