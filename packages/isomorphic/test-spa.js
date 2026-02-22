import puppeteer from 'puppeteer';

(async () => {
  console.log("Launching browser to test index.html...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.error('PAGE ERROR:', error));
  page.on('requestfailed', request => {
    console.error(`REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`);
  });

  console.log("Navigating to local static test server at http://localhost:3099/ ...");
  try {
    await page.goto('http://localhost:3099/', { waitUntil: 'networkidle0' });
    console.log("Finished loading page. Extracted Body Content Length:", (await page.content()).length);
  } catch (e) {
    console.error("Navigation error:", e);
  }

  await browser.close();
})();
