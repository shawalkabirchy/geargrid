import { expect, test } from "@playwright/test";
import { logIn } from "./login";

// C2 (DokaanBondhu spec D193): parts search and the part page, a new part with its number and fitment, vehicles,
// shop words, and customers and suppliers with their ledgers, on the seeded shop.

test.beforeEach(async ({ page }) => logIn(page));

test("searches parts by shop word and by number, and opens a part", async ({ page }) => {
  await page.getByRole("link", { name: "পার্টস" }).click();
  await page.getByLabel("নাম, নম্বর বা দোকানের শব্দ").fill("brek");
  await page.getByRole("button", { name: "খুঁজুন" }).click();
  await expect(page.getByTestId("part-count")).toContainText("টি পার্ট");

  await page.getByLabel("নাম, নম্বর বা দোকানের শব্দ").fill("04465 10010");
  await page.getByRole("button", { name: "খুঁজুন" }).click();
  await page.getByRole("row").filter({ hasText: "04465-10010" }).getByRole("link").first().click();
  await expect(page.getByTestId("numbers")).toContainText("04465-10010");
  await expect(page.getByText("B-3", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("fitments")).toContainText("Toyota Axio");

  const numbers = page.getByTestId("numbers");
  await numbers.getByLabel("পার্ট নম্বর").fill("E2E-NUM-1");
  await numbers.getByRole("button", { name: "যোগ করুন" }).click();
  await expect(numbers.getByText("E2E-NUM-1")).toBeVisible();
  await numbers
    .getByRole("listitem")
    .filter({ hasText: "E2E-NUM-1" })
    .getByRole("button", { name: "মুছুন" })
    .click();
  await expect(numbers.getByText("E2E-NUM-1")).toHaveCount(0);
});

test("adds a part, links it to a new vehicle and finds it by car model", async ({ page }) => {
  await page.goto("/vehicles");
  await page.getByLabel("কোম্পানি").fill("E2EMake");
  await page.getByLabel("মডেল").fill("E2EModel");
  await page.getByLabel("শুরুর সাল").fill("২০১৫");
  await page.getByRole("button", { name: "যোগ করুন" }).click();
  await expect(page.getByRole("cell", { name: "E2EModel" })).toBeVisible();

  await page.goto("/parts/new");
  await page.getByLabel("ইংরেজি নাম").fill("E2E test bush");
  await page.getByLabel("মূল পার্ট নম্বর").fill("E2E-BUSH-1");
  await page.getByLabel("খুচরা দাম", { exact: true }).fill("১,২০০");
  await page.getByLabel("র‍্যাক").fill("Z-1");
  await page.getByRole("button", { name: "সেভ করুন" }).click();
  await expect(page.getByRole("heading", { name: /E2E test bush/ })).toBeVisible();
  await expect(page.getByTestId("part-stock")).toContainText("০");
  await expect(page.getByText("১,২০০ টাকা").first()).toBeVisible();

  const fitments = page.getByTestId("fitments");
  await fitments.getByLabel("গাড়ি").selectOption({ label: "E2EMake E2EModel ২০১৫–এখনো" });
  await fitments.getByRole("button", { name: "যোগ করুন" }).click();
  await expect(fitments.getByText("E2EMake E2EModel")).toBeVisible();

  await page.goto("/parts?car=E2EMake%7CE2EModel&year=2020");
  await expect(page.getByRole("link", { name: "E2E test bush" })).toBeVisible();

  await page.getByRole("link", { name: "E2E test bush" }).click();
  await page.getByRole("link", { name: "পার্ট বদলান" }).click();
  await page.getByLabel("পাইকারি (গ্যারেজ) দাম").fill("1100");
  await page.getByRole("button", { name: "সেভ করুন" }).click();
  await expect(page.getByText("১,১০০ টাকা")).toBeVisible();
});

test("a wrong form says which field is wrong", async ({ page }) => {
  await page.goto("/vehicles");
  await page.getByLabel("কোম্পানি").fill("Bad");
  await page.getByLabel("মডেল").fill("Years");
  await page.getByLabel("শুরুর সাল").fill("2020");
  await page.getByLabel("শেষ সাল").fill("2010");
  await page.getByRole("button", { name: "যোগ করুন" }).click();
  await expect(page.getByText("কিছু ঘর ঠিক নেই: শেষ সাল")).toBeVisible();
});

test("adds and removes a shop word", async ({ page }) => {
  await page.goto("/aliases");
  await page.getByLabel("শব্দ").fill("e2eword");
  await page.getByRole("button", { name: "যোগ করুন" }).click();
  const row = page.getByRole("row").filter({ hasText: "e2eword" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "মুছুন" }).click();
  await expect(row).toHaveCount(0);
});

test("shows a customer's ledger, adds a customer and removes the unused one", async ({ page }) => {
  await page.getByRole("link", { name: "কাস্টমার" }).click();
  await expect(page.getByTestId("total-due")).toContainText("টাকা");
  await page.getByRole("row").nth(1).getByRole("link").click();
  await expect(page.getByRole("heading", { name: "বাকির খাতা" })).toBeVisible();

  await page.goto("/customers/new");
  await page.getByLabel("নাম").fill("E2E Garage");
  await page.getByLabel("ধরন").selectOption("garage");
  await page.getByLabel("ফোন").fill("01700000099");
  await page.getByRole("button", { name: "সেভ করুন" }).click();
  await expect(page.getByRole("heading", { name: /E2E Garage/ })).toBeVisible();
  await expect(page.getByText("খাতায় এখনো কিছু নেই।")).toBeVisible();
  await page.getByLabel("বাকির সীমা").fill("20000");
  await page.getByRole("button", { name: "সেভ করুন" }).click();
  await expect(page.getByRole("status")).toHaveText("সেভ হয়েছে।");
  await page.getByRole("button", { name: "কাস্টমার মুছুন" }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole("link", { name: "E2E Garage" })).toHaveCount(0);
});

test("adds a supplier and opens the suppliers list", async ({ page }) => {
  await page.goto("/suppliers/new");
  await page.getByLabel("নাম").fill("E2E Supplier");
  await page.getByRole("button", { name: "সেভ করুন" }).click();
  await expect(page.getByRole("heading", { name: "E2E Supplier" })).toBeVisible();
  await page.getByRole("button", { name: "সাপ্লায়ার মুছুন" }).click();
  await expect(page.getByTestId("total-payable")).toContainText("টাকা");
});
