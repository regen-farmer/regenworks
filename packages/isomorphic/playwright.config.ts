import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Load .env into the test runner; does not override vars already set in CI.
if (existsSync(".env")) process.loadEnvFile(".env");

const PORT = Number(process.env.ISOMORPHIC_PORT ?? process.env.PORT ?? 10000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export const STORAGE_STATE = "tests/e2e/.auth/user.json";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "smoke",
      testMatch: /.*\.smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authed",
      testMatch: /.*\.authed\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
    },
  ],

  // Starts the already-built SSR server directly (not the Render-owned `start`).
  webServer: {
    command: "node --env-file-if-exists=.env .output/server/index.mjs",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
});
