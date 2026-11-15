import { expect, test, type Page } from "@playwright/test";
import { logIn } from "./login";

// GearGrid on the phone (DokaanBondhu spec D243), on a Pixel 7: the app installs (its manifest and icons), the bottom
// bar reaches each of its pages, a credit sale takes under 30 seconds, a payment is received, and no key page
// scrolls sideways. The computer's tests (c1 to c5) run in the `chromium` project.

const SALE_PAGE = /\/sales\/[0-9a-f-]{36}$/;

/** The bottom bar: on a phone it is the only one of its kind on screen. */
const bar = (page: Page) => page.getByRole("navigation", { name: "প্রধান কাজ" });

/** Saves, accepting the warnings (low stock, credit limit) when they are shown. */
async function saveAccepting(page: Page, button: string, done: RegExp) {
  await page.getByRole("button", { name: button }).click();
  const anyway = page.getByRole("button", { name: "হ্যাঁ, সেভ করুন" });
  await expect(async () => {
    if (await anyway.isVisible()) await anyway.click();
    await expect(page).toHaveURL(done, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

async function noSidewaysScroll(page: Page) {
  const [scroll, screen] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(scroll, `${page.url()} scrolls sideways`).toBeLessThanOrEqual(screen);
}

test("installs: a manifest with its name, start page, full screen and icons that load", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#1e2556");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest.name).toBe("GearGrid");
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  for (const src of [...manifest.icons.map((icon) => icon.src), "/apple-icon"]) {
    const icon = await request.get(src);
    expect(icon.ok(), src).toBe(true);
    expect(icon.headers()["content-type"], src).toContain("image/png");
  }
});

test.describe("logged in", () => {
  test.beforeEach(async ({ page }) => logIn(page));

  test("the bottom bar reaches each of its pages", async ({ page }) => {
    await expect(bar(page).getByRole("link")).toHaveCount(5);
    const stops = [
      { name: "বিক্রি", url: /\/sales$/, heading: "বিক্রির তালিকা" },
      { name: "নতুন বিক্রি", url: /\/sales\/new$/, heading: "নতুন বিক্রি" },
      { name: "পার্টস", url: /\/parts$/, heading: "পার্টস" },
      { name: "কাস্টমার", url: /\/customers$/, heading: "কাস্টমার" },
      { name: "হোম", url: /\/$/, heading: /আজকের হিসাব/ },
    ];
    for (const stop of stops) {
      await bar(page).getByRole("link", { name: stop.name, exact: true }).click();
      await expect(page).toHaveURL(stop.url);
      await expect(page.getByRole("heading", { level: 1, name: stop.heading })).toBeVisible();
      await expect(bar(page).getByRole("link", { name: stop.name, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  });

  test("a credit sale on the phone takes under 30 seconds", async ({ page }) => {
    const started = Date.now();
    await bar(page).getByRole("link", { name: "নতুন বিক্রি", exact: true }).click();
    await page.getByLabel("কাস্টমার", { exact: true }).selectOption({ index: 1 });
    await page.getByLabel(/পার্ট খুঁজুন/).fill("filter");
    await page.getByRole("listitem").getByRole("button").first().click();
    await page.getByRole("button", { name: "এক বেশি" }).click();
    await expect(page.getByLabel("পরিমাণ")).toHaveValue("2");
    await page.getByLabel("টাকা", { exact: true }).fill("0");
    await expect(page.getByTestId("sale-due")).toHaveText(await page.getByTestId("sale-total").innerText());
    // Save is in the bar at the bottom, the only Save on a phone's screen
    await saveAccepting(page, "বিক্রি সেভ করুন", SALE_PAGE);
    await expect(page.getByTestId("bill-due")).not.toHaveText("০ টাকা");
    expect(Date.now() - started).toBeLessThan(30_000);
  });

  test("receives a customer's payment on the phone", async ({ page }) => {
    await bar(page).getByRole("link", { name: "কাস্টমার", exact: true }).click();
    await page.getByRole("listitem").getByRole("link").first().click();
    const due = await page.getByTestId("customer-due").innerText();
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "জমা নিন" }) });
    await form.getByLabel("টাকা").fill("১০০");
    await form.getByRole("button", { name: "জমা নিন" }).click();
    await expect(page.getByRole("status")).toContainText("জমা হয়েছে।");
    await expect(page.getByTestId("customer-due")).not.toHaveText(due);
  });

  test("no key page scrolls sideways", async ({ page }) => {
    for (const path of [
      "/",
      "/sales",
      "/sales/new",
      "/customers",
      "/parts",
      "/purchases",
      "/purchases/new",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noSidewaysScroll(page);
    }
    await page.goto("/customers");
    await page.getByRole("listitem").getByRole("link").first().click();
    await expect(page.getByTestId("customer-due")).toBeVisible();
    await noSidewaysScroll(page);
    await page.goto("/parts?q=filter");
    await page.getByRole("listitem").getByRole("link").first().click();
    await expect(page.getByTestId("part-stock")).toBeVisible();
    await noSidewaysScroll(page);
  });
});
