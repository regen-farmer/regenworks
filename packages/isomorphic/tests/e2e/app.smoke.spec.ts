// Unauthenticated smoke tests: app boots, public routes render, auth gate shows.
import { test, expect } from "@playwright/test";

test("home renders the auth gate (login screen)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /log in or create new user/i })).toBeVisible();
});

test("public terms page renders", async ({ page }) => {
  const response = await page.goto("/terms");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByText(/terms/i).first()).toBeVisible();
});

test("public privacy page renders", async ({ page }) => {
  const response = await page.goto("/privacy");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByText(/privacy/i).first()).toBeVisible();
});

test("no console errors on initial load", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await expect(page.getByRole("button", { name: /log in/i })).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});
