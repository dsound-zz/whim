import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

chromium.use(stealth());

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating with Stealth Plugin...');
  await page.goto('https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59', { waitUntil: 'domcontentloaded' });
  
  await page.waitForTimeout(5000);
  
  const content = await page.content();
  fs.writeFileSync('dice-debug.html', content);
  
  await browser.close();
  console.log('Saved to dice-debug.html');
}
run();
