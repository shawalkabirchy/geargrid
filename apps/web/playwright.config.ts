import { defineConfig, devices } from "@playwright/test";

// The web dashboard's page tests (GearGrid plan 12; DokaanBondhu spec D193). They run against a built app on the
// seeded database, with the CI-only test login (GEARGRID_ENV=ci and WEB_TEST_PASSWORD), in CI after `next build`.
// Two projects (D243): `chromium`, the computer's tests, and `phone`, a Pixel 7 running only `phone.e2e.ts`.

const port = 3210;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: "**/phone.e2e.ts" },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: "**/phone.e2e.ts" },
  ],
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://localhost:${port}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
