import { chromium } from "playwright";

async function check() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto("http://localhost:3000/feed");
  await page.waitForTimeout(3000);
  
  const html = await page.content();
  console.log("HTML length:", html.length);
  if (html.includes("mapboxgl-canvas")) {
    console.log("Mapbox canvas is present.");
  } else {
    console.log("Mapbox canvas is MISSING.");
  }
  
  if (html.includes("FloatingControls") || html.includes("Tonight")) {
    console.log("Floating controls are present.");
  }
  
  await browser.close();
}

check().catch(console.error);
