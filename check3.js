import { chromium } from "playwright";

async function check() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto("http://localhost:3000/feed");
  await page.waitForTimeout(3000);
  
  const rect = await page.evaluate(() => {
    const el = document.querySelector('.mapboxgl-canvas');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  console.log("Canvas rect:", rect);
  
  const mapContainerRect = await page.evaluate(() => {
    const el = document.querySelector('.absolute.inset-0.z-0');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  console.log("Container rect:", mapContainerRect);
  
  await browser.close();
}

check().catch(console.error);
