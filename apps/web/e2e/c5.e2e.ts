import { expect, test, type Download } from "@playwright/test";
import ExcelJS from "exceljs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logIn } from "./login";

// C5 (DokaanBondhu spec D193): reports with their Excel download, a customer's statement, the Excel import from the
// template to the imported part, the history of changes, and the owner's full export, on the seeded shop.

const RUN = Date.now().toString(36).toUpperCase();

test.beforeEach(async ({ page }) => logIn(page));

async function workbook(download: Download): Promise<ExcelJS.Workbook> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await readFile(await download.path())) as unknown as ArrayBuffer);
  return book;
}

test("shows profit and loss for a range and downloads it as Excel", async ({ page }) => {
  await page.getByRole("link", { name: "রিপোর্ট", exact: true }).click();
  await page.getByRole("link", { name: "লাভ-ক্ষতি" }).click();
  await expect(page.getByRole("cell", { name: "নিট লাভ" }).first()).toBeVisible();
  await page.getByRole("link", { name: "গত ৯০ দিন" }).click();
  await expect(page.getByRole("heading", { name: "মাস অনুযায়ী" })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "এক্সেলে নামান" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^profit-loss_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const sheet = (await workbook(download)).worksheets[0]!;
  expect(String(sheet.getCell("A1").value)).toContain("লাভ-ক্ষতি");
});

test("opens a customer's statement from the customer page, with a WhatsApp link", async ({ page }) => {
  await page.goto("/customers");
  await page.getByRole("row").nth(1).getByRole("link").click();
  await page.getByRole("link", { name: "স্টেটমেন্ট" }).click();
  await expect(page.getByRole("heading", { name: "কাস্টমারের স্টেটমেন্ট" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "শেষে" })).toBeVisible();
  await expect(page.getByRole("link", { name: "হোয়াটসঅ্যাপে পাঠান" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\//,
  );
});

test("imports parts from the filled-in template and finds the new part", async ({ page }) => {
  await page.getByRole("link", { name: "এক্সেল ইমপোর্ট" }).click();
  const [template] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "পার্ট ও স্টক টেমপ্লেট" }).click(),
  ]);
  const book = await workbook(template);
  const sheet = book.worksheets[0]!;
  const headers = (sheet.getRow(1).values as string[]).slice(1);
  const row: Record<string, string | number> = {
    name_en: `E2E import bush ${RUN}`,
    category: "Suspension and steering",
    quality: "aftermarket",
    unit: "piece",
    part_number: `E2E-IMP-${RUN}`,
    rack_location: "Z-2",
    retail_price: 900,
    garage_price: 850,
    cost_price: 600,
    opening_qty: 4,
    fits: "Toyota Axio 2012-2017 1NZ",
  };
  sheet.addRow(headers.map((header) => row[header] ?? null));
  const file = join(await mkdtemp(join(tmpdir(), "gg-import-")), "parts.xlsx");
  await writeFile(file, Buffer.from(await book.xlsx.writeBuffer()));

  await page.getByLabel("কী তুলবেন").selectOption("parts");
  await page.getByLabel("ফাইল").setInputFiles(file);
  await page.getByRole("button", { name: "যাচাই করুন" }).click();
  await expect(page).toHaveURL(/\/import\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("import-status")).toHaveText("যাচাই হয়েছে, নিশ্চিতের অপেক্ষায়");
  await expect(page.getByTestId("file-total")).toContainText("২,৪০০ টাকা");
  await page.getByRole("button", { name: "নিশ্চিত করে যোগ করুন" }).click();
  await expect(page.getByTestId("import-status")).toHaveText("যোগ হয়েছে");
  await expect(page.getByTestId("imported-total")).toContainText("ফাইলের সাথে মিলেছে");

  await page.goto(`/parts?q=E2E-IMP-${RUN}`);
  await page.getByRole("link", { name: `E2E import bush ${RUN}` }).click();
  await expect(page.getByTestId("part-stock")).toContainText("৪");
  await expect(page.getByTestId("fitments")).toContainText("Toyota Axio");
});

test("a file with an error cannot be imported", async ({ page }) => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("data");
  sheet.addRow(["name_en", "category", "retail_price"]);
  sheet.addRow([`No price ${RUN}`, "Brakes", null]);
  const file = join(await mkdtemp(join(tmpdir(), "gg-import-")), "bad.xlsx");
  await writeFile(file, Buffer.from(await book.xlsx.writeBuffer()));
  await page.goto("/import");
  await page.getByLabel("ফাইল").setInputFiles(file);
  await page.getByRole("button", { name: "যাচাই করুন" }).click();
  await expect(page.getByTestId("import-row")).toContainText("retail_price দিতে হবে।");
  await expect(page.getByRole("button", { name: "নিশ্চিত করে যোগ করুন" })).toHaveCount(0);
  await page.getByRole("button", { name: "বাতিল" }).click();
  await expect(page.getByTestId("import-status")).toHaveText("বাতিল");
});

test("shows the history of changes, by source and for one part", async ({ page }) => {
  await page.getByRole("link", { name: "ইতিহাস" }).click();
  await expect(page.getByTestId("audit-row").first()).toBeVisible();
  await page.getByLabel("কোথা থেকে").selectOption("web");
  await page.getByRole("button", { name: "খুঁজুন" }).click();
  await expect(page).toHaveURL(/source=web/);
  const rows = page.getByTestId("audit-row");
  await expect(rows.first()).toContainText("ওয়েব");
  expect(await rows.filter({ hasNotText: "ওয়েব" }).count()).toBe(0);

  await page.goto("/parts?q=04465-10010");
  await page.getByRole("row").filter({ hasText: "04465-10010" }).getByRole("link").first().click();
  await expect(page.getByTestId("part-stock")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "ইতিহাস" }).click();
  await expect(page).toHaveURL(/\/audit\?entity=part&id=/);
});

test("downloads all the shop's data, one sheet per table", async ({ page }) => {
  await page.goto("/reports");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "সব তথ্য নামান" }).click(),
  ]);
  const book = await workbook(download);
  expect(book.worksheets.map((sheet) => sheet.name)).toEqual(
    expect.arrayContaining(["parts", "sales", "customers"]),
  );
  expect(book.getWorksheet("parts")!.actualRowCount).toBeGreaterThan(200);
});
