// Click-through tour of the real app as the logged-in test user.
//
// For each step it records page crashes and console errors (including WebGL
// shader errors from deck.gl/luma.gl) and attaches a screenshot to the HTML
// report, so every CI run leaves a picture of each screen to look through.
//
// Only safe actions are clicked (navigation, view toggles). Buttons that
// delete, pay, log out or send email are never pressed.
import { test, expect, type Page, type TestInfo } from "@playwright/test";

const LOGIN_GATE = /log in or create new user/i;

// Errors that come from the staging backend being slow or asleep, not from the app.
const IGNORED = [
  /failed to fetch|networkerror|load failed|err_connection|fetch failed/i,
  /status of (502|503|504)/i,
  /favicon/i,
];

// "Not allowed" responses: the page asked for data this user can't see (e.g. admin-only
// lists). Recorded as notes on the test, not failures.
const PERMISSION = /status of (401|403)/i;

// Anything that looks like a WebGL or shader failure is always an error.
const GPU_ERROR = /DECKGL_|shader|GLSL|no matching overloaded function|WebGL: INVALID|luma\.gl.*error/i;

type Collected = { pageErrors: string[]; consoleErrors: string[] };

function collectErrors(page: Page): Collected {
  const c: Collected = { pageErrors: [], consoleErrors: [] };
  page.on("pageerror", (err) => c.pageErrors.push(`${err.name}: ${err.message}`));
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" || GPU_ERROR.test(text)) c.consoleErrors.push(text);
  });
  return c;
}

function realErrors(c: Collected): string[] {
  return [...c.pageErrors, ...c.consoleErrors].filter(
    (e) => GPU_ERROR.test(e) || !(IGNORED.some((re) => re.test(e)) || PERMISSION.test(e)),
  );
}

function notePermissionErrors(c: Collected, testInfo: TestInfo, where: string) {
  const n = c.consoleErrors.filter((e) => PERMISSION.test(e)).length;
  if (n) {
    testInfo.annotations.push({
      type: "not allowed",
      description: `${where}: ${n} request(s) answered 401/403 for a normal user`,
    });
  }
}

async function snap(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
}

/** Wait for the network to calm down, but don't fail if map tiles keep streaming. */
async function settle(page: Page, ms = 1500) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

const TOP_LEVEL = [
  { path: "/", name: "home (farms map)" },
  { path: "/parcels", name: "farms" },
  { path: "/systems", name: "systems" },
  { path: "/species", name: "species" },
  { path: "/settings", name: "settings" },
];

for (const { path, name } of TOP_LEVEL) {
  test(`tour: ${name} renders cleanly`, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${path} should not be a server error`).toBeLessThan(500);
    await expect(page.getByRole("button", { name: LOGIN_GATE })).toBeHidden();
    await settle(page);
    await snap(page, testInfo, name);
    notePermissionErrors(errors, testInfo, path);
    expect(realErrors(errors), `${path}:\n${realErrors(errors).join("\n")}`).toEqual([]);
  });
}

test("tour: open a project and switch the map to 3D", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);

  // Find the first project the test user can open, via the farms list.
  await page.goto("/parcels", { waitUntil: "domcontentloaded" });
  await settle(page);
  const farmLink = page.locator('a[href^="/parcels/"]').first();
  test.skip(
    (await farmLink.count()) === 0,
    "The e2e test user has no farms on staging. Add one farm with a designed project to run this test.",
  );
  await farmLink.click();
  await settle(page);
  await snap(page, testInfo, "farm");

  const projectLink = page.locator('a[href*="/projects/"]').first();
  test.skip(
    (await projectLink.count()) === 0,
    "The test user's first farm has no project. Add a designed project to run this test.",
  );
  await projectLink.click();
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible({ timeout: 30_000 });
  await settle(page, 3000);
  await snap(page, testInfo, "project 2D");

  // The 3D switch is a map control button titled "3D Visualization".
  const toggle = page.locator('button[title="3D Visualization"]').first();
  await expect(toggle, "3D map button should be on the project map").toBeVisible({ timeout: 20_000 });
  await toggle.click();
  await settle(page, 5000);
  await snap(page, testInfo, "project 3D");

  // And back to the planting plan.
  const back = page.locator('button[title="Planting Plan"]').first();
  if (await back.isVisible().catch(() => false)) {
    await back.click();
    await settle(page);
    await snap(page, testInfo, "project back to 2D");
  }

  notePermissionErrors(errors, testInfo, "project / 3D");
  expect(realErrors(errors), `project / 3D:\n${realErrors(errors).join("\n")}`).toEqual([]);
});
