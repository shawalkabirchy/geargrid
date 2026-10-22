import { expect, test, type Page } from "@playwright/test";
import { logIn } from "./login";

// C3 (DokaanBondhu spec D193): a walk-in cash sale with its bill and WhatsApp link, then its void; a credit sale and a
// return off the due; a customer's payment and its reversal; a purchase and its reversal, on the seeded shop.

test.beforeEach(async ({ page }) => logIn(page));

const SALE_PAGE = /\/sales\/[0-9a-f-]{36}$/;
const PURCHASE_PAGE = /\/purchases\/[0-9a-f-]{36}$/;

async function addPart(page: Page, query: string) {
  await page.getByLabel(/পার্ট খুঁজুন/).fill(query);
  await page.getByRole("listitem").getByRole("button").first().click();
}

/** Saves, accepting the warnings (low stock, credit limit) when they are shown. */
async function saveAccepting(page: Page, button: string, done: RegExp) {
  await page.getByRole("button", { name: button }).click();
  const anyway = page.getByRole("button", { name: "হ্যাঁ, সেভ করুন" });
  await expect(async () => {
    if (await anyway.isVisible()) await anyway.click();
    await expect(page).toHaveURL(done, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

test("sells to a walk-in for cash, shows the bill with a WhatsApp link, and voids it", async ({ page }) => {
  await page.getByRole("link", { name: "নতুন বিক্রি" }).first().click();
  await addPart(page, "filter");
  await expect(page.getByTestId("cart").getByRole("row")).toHaveCount(2);
  const total = await page.getByTestId("sale-total").innerText();
  await expect(page.getByTestId("sale-due")).toHaveText("০ টাকা");
  await saveAccepting(page, "বিক্রি সেভ করুন", SALE_PAGE);

  await expect(page.getByTestId("invoice-no")).toHaveText(/^W-\d{6}$/);
  await expect(page.getByTestId("bill")).toContainText(total);
  await expect(page.getByTestId("bill-due")).toHaveText("০ টাকা");
  await expect(page.getByRole("link", { name: "হোয়াটসঅ্যাপে পাঠান" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/\?text=/,
  );

  await page.getByLabel("কেন বাতিল").fill("ভুল বিক্রি");
  await page.getByRole("button", { name: "বিক্রি বাতিল করুন" }).click();
  await expect(page.getByText("বাতিল হয়েছে: ভুল বিক্রি")).toBeVisible();
});

test("a walk-in cannot leave a due", async ({ page }) => {
  await page.goto("/sales/new");
  await addPart(page, "filter");
  await page.getByLabel("টাকা", { exact: true }).fill("1");
  await page.getByRole("button", { name: "বিক্রি সেভ করুন" }).click();
  await expect(page.getByText("বাকি রাখতে কাস্টমার বেছে নিন।")).toBeVisible();
});

test("sells on credit to a garage and takes part of it back off the due", async ({ page }) => {
  await page.goto("/sales/new");
  await page.getByLabel("কাস্টমার", { exact: true }).selectOption({ index: 1 });
  await addPart(page, "plug");
  await page.getByLabel("টাকা", { exact: true }).fill("0");
  await expect(page.getByTestId("sale-due")).toHaveText(await page.getByTestId("sale-total").innerText());
  await saveAccepting(page, "বিক্রি সেভ করুন", SALE_PAGE);
  await expect(page.getByTestId("bill-due")).not.toHaveText("০ টাকা");

  await page.getByRole("link", { name: "ফেরত নিন" }).click();
  await page
    .getByTestId("return-line")
    .first()
    .getByLabel(/কয়টি ফেরত/)
    .fill("1");
  await page.getByRole("button", { name: "হিসাব দেখুন" }).click();
  await expect(page.getByTestId("return-total")).toContainText("টাকা");
  await page.getByRole("button", { name: "ফেরত সেভ করুন" }).click();
  await expect(page).toHaveURL(SALE_PAGE);
  await expect(page.getByRole("heading", { name: "ফেরত" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ফেরত নিন" })).toBeHidden();
});

test("receives a customer's payment and reverses it", async ({ page }) => {
  await page.goto("/customers");
  await page.getByRole("row").nth(1).getByRole("link").click();
  const due = await page.getByTestId("customer-due").innerText();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "জমা নিন" }) });
  await form.getByLabel("টাকা").fill("১০০");
  await form.getByRole("button", { name: "জমা নিন" }).click();
  await expect(page.getByRole("status")).toContainText("জমা হয়েছে।");
  await expect(page.getByTestId("customer-due")).not.toHaveText(due);

  const first = page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: "জমা ফেরান" }) })
    .first();
  await first.getByLabel("কেন ফেরানো").fill("ভুল জমা");
  await first.getByRole("button", { name: "জমা ফেরান" }).click();
  await expect(page.getByTestId("customer-due")).toHaveText(due);
});

test("brings stock in with a purchase and reverses it", async ({ page }) => {
  await page.getByRole("link", { name: "কেনা", exact: true }).click();
  await page.getByRole("link", { name: "নতুন কেনা (স্টক আনা)" }).click();
  await page.getByLabel("সাপ্লায়ার", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("সাপ্লায়ারের বিল নম্বর").fill("E2E-BILL-1");
  await addPart(page, "filter");
  await page.getByLabel("পরিমাণ").fill("৫");
  await page.getByLabel("কেনা দাম").fill("200");
  await expect(page.getByTestId("purchase-total")).toHaveText("১,০০০ টাকা");
  await page.getByLabel("টাকা", { exact: true }).fill("400");
  await saveAccepting(page, "কেনা সেভ করুন", PURCHASE_PAGE);
  await expect(page.getByText("E2E-BILL-1")).toBeVisible();

  await page.getByLabel("কেন ফেরানো").fill("ভুল বিল");
  await page.getByRole("button", { name: "কেনা ফেরান" }).click();
  await expect(page.getByText("ফেরানো হয়েছে: ভুল বিল")).toBeVisible();
});
