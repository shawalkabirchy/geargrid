import { expect, test } from "@playwright/test";
import { logIn } from "./login";

// C4 (DokaanBondhu spec D193): a transfer and the cash book, the daily closing, expenses, a cheque that clears, a stock
// adjustment and a rack count, paying a supplier, and the review list, on the seeded shop.

test.beforeEach(async ({ page }) => logIn(page));

test("transfers from bKash to the cash box and sees it in the cash book; closes bKash's day", async ({
  page,
}) => {
  await page.getByRole("link", { name: "টাকা", exact: true }).click();
  await page.getByLabel("কোথা থেকে").selectOption({ index: 1 }); // the active accounts: Cash box, bKash, ...
  await page.getByLabel("কোথায়").selectOption({ index: 0 });
  await page.getByLabel("টাকা", { exact: true }).fill("১০০");
  await page.getByRole("button", { name: "যোগ করুন" }).first().click();
  await expect(page.getByRole("status")).toHaveText("পাঠানো হয়েছে।");

  await page.getByRole("row").filter({ hasText: "Cash box" }).getByRole("link", { name: "ক্যাশ বই" }).click();
  await expect(page.getByRole("cell", { name: "হিসাব বদল" }).first()).toBeVisible();

  await page.goto("/money");
  await page
    .getByRole("row")
    .filter({ hasText: "bKash" })
    .first()
    .getByRole("link", { name: "ক্যাশ বই" })
    .click();
  await page.getByLabel("গুনে পাওয়া").fill("1000");
  await page.getByRole("button", { name: "দিনের হিসাব বন্ধ করুন" }).click();
  // closed now, or already closed by an earlier run on the same database
  await expect(page.getByText(/দিনের হিসাব বন্ধ হয়েছে|এই দিনের হিসাব আগেই বন্ধ হয়েছে/)).toBeVisible();
});

test("records an expense", async ({ page }) => {
  await page.getByRole("link", { name: "খরচ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "খরচ লিখুন" })).toBeVisible();
  const defaults = page.getByRole("button", { name: "সাধারণ ছয়টি ক্যাটাগরি যোগ করুন" });
  if (await defaults.isVisible()) {
    await defaults.click();
    await expect(page.getByLabel("ক্যাটাগরি")).toBeVisible();
  }
  const before = await page.getByTestId("expense-total").innerText();
  await page.getByLabel("ক্যাটাগরি").selectOption({ label: "চা-নাস্তা" });
  await page.getByLabel("টাকা", { exact: true }).fill("80");
  await page.getByRole("button", { name: "যোগ করুন" }).first().click();
  await expect(page.getByRole("status")).toHaveText("খরচ লেখা হয়েছে।");
  await expect(page.getByTestId("expense-total")).not.toHaveText(before);
});

test("clears a pending cheque into the bank", async ({ page }) => {
  await page.goto("/cheques?status=pending");
  const row = page.getByTestId("cheque-row").first();
  const number = (await row.getByRole("cell").nth(3).innerText()).split(/\s+/).pop()!;
  await row.getByRole("button", { name: "ক্লিয়ার হয়েছে" }).click();
  // a cleared cheque leaves the pending list
  await expect(page.getByTestId("cheque-row").filter({ hasText: number })).toHaveCount(0);
  await page.goto("/cheques?status=cleared");
  await expect(page.getByTestId("cheque-row").filter({ hasText: number })).toContainText("ক্লিয়ার");
});

test("adjusts a part's stock and counts a rack", async ({ page }) => {
  await page.getByRole("link", { name: "স্টক", exact: true }).click();
  await expect(page.getByTestId("stock-value")).toContainText("টাকা");

  await page.goto("/parts?q=04465-10010");
  await page.getByRole("row").filter({ hasText: "04465-10010" }).getByRole("link").first().click();
  const stock = await page.getByTestId("part-stock").innerText();
  const adjust = page.getByTestId("adjust");
  await adjust.getByLabel("পরিমাণ").fill("2");
  await adjust.getByLabel("কারণ").selectOption("found");
  await adjust.getByRole("button", { name: "সেভ করুন" }).click();
  await expect(adjust.getByRole("status")).toHaveText("স্টক ঠিক হয়েছে।");
  await page.reload();
  await expect(page.getByTestId("part-stock")).not.toHaveText(stock);

  await page.goto("/stock/count?rack=B-3");
  await page
    .getByLabel(/গুনে পাওয়া/)
    .first()
    .fill("3");
  await page.getByRole("button", { name: "গণনা সেভ করুন" }).click();
  await expect(page.getByRole("status")).toContainText("পার্টের স্টক ঠিক হয়েছে।");
});

test("pays a supplier", async ({ page }) => {
  await page.goto("/suppliers");
  await page.getByRole("row").nth(1).getByRole("link").click();
  const payable = await page.getByTestId("supplier-payable").innerText();
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "সাপ্লায়ারকে টাকা দিন" }) });
  await form.getByLabel("টাকা").fill("100");
  await form.getByRole("button", { name: "সাপ্লায়ারকে টাকা দিন" }).click();
  await expect(page.getByRole("status")).toHaveText("টাকা দেওয়া হয়েছে।");
  await expect(page.getByTestId("supplier-payable")).not.toHaveText(payable);
});

test("opens the review list", async ({ page }) => {
  await page.getByRole("link", { name: "দেখে নিন" }).click();
  await expect(page.getByRole("heading", { name: "দেখে নিন" })).toBeVisible();
});
