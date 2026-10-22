import { dhakaDate } from "@geargrid/core";
import { PassThrough, Readable } from "node:stream";
import { writeAllData } from "../../../src/server/services/data-export";
import { currentUser } from "../../../src/web/auth";
import { download, fileName } from "../../../src/web/excel";

export const runtime = "nodejs";

/** GET /export/all: every table of the shop in one Excel file, for the owner (GearGrid plan 2.12). */
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Log in first.", { status: 401 });
  if (user.role !== "owner") return new Response("Only the owner can export all the data.", { status: 403 });
  const stream = new PassThrough();
  writeAllData(stream).catch((error: unknown) => {
    console.error(error);
    stream.destroy(error instanceof Error ? error : new Error(String(error)));
  });
  return download(
    Readable.toWeb(stream) as ReadableStream,
    fileName("geargrid-all-data", dhakaDate(new Date())),
  );
}
