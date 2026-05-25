import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const { scrapeDiceEvents } = await import('../src/lib/dice/scraper');
  console.log('[Dice Runner] Starting Dice scraper...');
  const results = await scrapeDiceEvents();
  console.log('[Dice Runner] Dice scraper complete:', results);
}

main().catch(console.error).finally(() => process.exit(0));
