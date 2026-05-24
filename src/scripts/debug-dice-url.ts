import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Try tonight query param
  await page.goto('https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59?date=tonight', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  const rawEvents = await page.evaluate(() => {
    const eventElements = document.querySelectorAll('a[href*="/event/"]');
    return Array.from(eventElements).map(el => (el as HTMLElement).innerText.split('\n')[0]);
  });
  
  console.log('Events with ?date=tonight:', rawEvents.slice(0, 5));
  await browser.close();
}
run();
