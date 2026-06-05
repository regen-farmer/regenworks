// Authenticated tests: gated routes mount, home farms map renders.
import { test, expect } from "@playwright/test";

const LOGIN_GATE = /log in or create new user/i;
const BACKEND_TRANSIENT = /failed to fetch|networkerror|load failed|err_connection|fetch failed/i;

const AUTHED_ROUTES = ["/", "/parcels", "/systems", "/species", "/settings", "/admin"];

test("authenticated home shows the app, not the login screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: LOGIN_GATE })).toBeHidden();
});

test("home mounts the maplibre farms map", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
});

for (const route of AUTHED_ROUTES) {
  test(`authed route ${route} mounts without throwing`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(`${err.name}: ${err.message}`));

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} should not be a server error`).toBeLessThan(500);
    await expect(page.getByRole("button", { name: LOGIN_GATE })).toBeHidden();

    await page.waitForTimeout(500);
    const realErrors = pageErrors.filter((e) => !BACKEND_TRANSIENT.test(e));
    expect(realErrors, `${route} threw:\n${realErrors.join("\n")}`).toEqual([]);
  });
}
