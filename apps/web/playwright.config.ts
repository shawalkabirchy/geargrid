import { defineConfig, devices } from "@playwright/test";

// The web dashboard's page tests (GearGrid plan 12; DokaanBondhu spec D193). They run against a built app on the
// seeded database, with the CI-only test login (GEARGRID_ENV=ci and WEB_TEST_PASSWORD), in CI after `next build`.

const port = 3210;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://localhost:${port}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
