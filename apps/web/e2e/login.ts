import { expect, type Page } from "@playwright/test";

export const OWNER_EMAIL = "owner@demo-auto-parts.test";

/** Logs in as the seed owner with the CI-only test login. */
export async function logIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("ইমেইল").fill(OWNER_EMAIL);
  await page.getByLabel("পাসওয়ার্ড").fill(process.env.WEB_TEST_PASSWORD ?? "");
  await page.getByRole("button", { name: "লগ ইন করুন" }).click();
  await expect(page.getByRole("heading", { name: /আজকের হিসাব/ })).toBeVisible();
}
