import { chromium } from "playwright";

async function check() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  
  await page.goto("http://localhost:3000/feed");
  await page.waitForTimeout(3000);
  
  await browser.close();
}

check().catch(console.error);
