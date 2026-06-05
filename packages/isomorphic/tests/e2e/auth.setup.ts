import { test as setup, expect } from "@playwright/test";
import { STORAGE_STATE } from "../../playwright.config.ts";

// Logs in through the real Auth0 Universal Login flow and saves the session for
// the `authed` project. Needs E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD.
const EMAIL = process.env.E2E_TEST_USER_EMAIL;
const PASSWORD = process.env.E2E_TEST_USER_PASSWORD;

setup("authenticate via Auth0", async ({ page }) => {
  expect(
    EMAIL && PASSWORD,
    "Set E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD to run authenticated tests",
  ).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name: /log in/i }).click();

  const providerButton = page.getByRole("button", { name: /auth0|sign in/i });
  if (await providerButton.isVisible().catch(() => false)) {
    await providerButton.click();
  }

  await page.waitForURL(/auth0\.com|\.auth0|\/authorize|\/login/, { timeout: 30_000 });

  const emailField = page
    .locator('input[name="username"], input[name="email"], input[type="email"]')
    .first();
  await emailField.waitFor({ state: "visible", timeout: 20_000 });
  await emailField.fill(EMAIL!);

  // Identifier-first tenants need a "Continue" before the password appears.
  const passwordField = page.locator('input[name="password"], input[type="password"]').first();
  if (!(await passwordField.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /continue|next/i }).first().click();
  }
  await passwordField.waitFor({ state: "visible", timeout: 20_000 });
  await passwordField.fill(PASSWORD!);

  await page
    .getByRole("button", { name: /continue|log in|sign in|submit/i })
    .first()
    .click();

  await page.waitForURL((url) => url.origin === new URL(page.url()).origin && !/auth0/.test(url.host), {
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: /log in/i })).toBeHidden({ timeout: 20_000 });

  await page.context().storageState({ path: STORAGE_STATE });
});
