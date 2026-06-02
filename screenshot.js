import { chromium } from "playwright";

async function check() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto("http://localhost:3000/feed");
  await page.waitForTimeout(4000);
  
  await page.screenshot({ path: 'screenshot.png' });
  console.log("Screenshot taken.");
  
  await browser.close();
}

check().catch(console.error);
