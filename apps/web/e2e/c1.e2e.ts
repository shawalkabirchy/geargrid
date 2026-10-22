import { expect, test } from "@playwright/test";

// C1 (DokaanBondhu spec D193): login, Home, Settings, the language switch and logout, on the seeded shop.

const OWNER_EMAIL = "owner@demo-auto-parts.test";
const PASSWORD = process.env.WEB_TEST_PASSWORD ?? "";

test("a page behind the login sends a visitor to the login page", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "লগ ইন করুন" })).toBeVisible();
});

test("a wrong password is refused", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("ইমেইল").fill(OWNER_EMAIL);
  await page.getByLabel("পাসওয়ার্ড").fill("not-the-password");
  await page.getByRole("button", { name: "লগ ইন করুন" }).click();
  await expect(page.getByText("ইমেইল বা পাসওয়ার্ড ঠিক নেই।")).toBeVisible();
});

test("the owner logs in, sees today, saves settings, switches language and logs out", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("ইমেইল").fill(OWNER_EMAIL);
  await page.getByLabel("পাসওয়ার্ড").fill(PASSWORD);
  await page.getByRole("button", { name: "লগ ইন করুন" }).click();

  await expect(page.getByRole("heading", { name: /আজকের হিসাব/ })).toBeVisible();
  for (const tile of ["sales", "profit", "cash", "dues", "expenses"]) {
    await expect(page.getByTestId(`tile-${tile}`)).toContainText("টাকা");
  }
  await expect(page.getByRole("heading", { name: "হিসাবের ব্যালান্স" })).toBeVisible();

  await page.getByRole("link", { name: "সেটিংস" }).click();
  const market = page.getByLabel("মার্কেট / এলাকা");
  const original = await market.inputValue();
  await market.fill("Test Market");
  await page.getByRole("button", { name: "সেভ করুন" }).click();
  await expect(page.getByRole("status")).toHaveText("সেভ হয়েছে।");
  await page.reload();
  await expect(page.getByLabel("মার্কেট / এলাকা")).toHaveValue("Test Market");
  await page.getByLabel("মার্কেট / এলাকা").fill(original);
  await page.getByRole("button", { name: "সেভ করুন" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "বাংলা" }).click();
  await expect(page.getByRole("link", { name: "সেটিংস" })).toBeVisible();

  await page.getByRole("button", { name: "লগ আউট" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
