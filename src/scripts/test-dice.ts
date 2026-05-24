import { scrapeDiceEvents } from '../lib/dice/scraper';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    console.log('Testing Dice.fm Playwright Scraper...');
    const result = await scrapeDiceEvents();
    console.log('\n✅ Scrape complete!');
    console.log('Result:', result);
  } catch (err) {
    console.error('❌ Failed to scrape:', err);
  } finally {
    process.exit(0);
  }
}

run();
