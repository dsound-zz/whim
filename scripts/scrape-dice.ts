import * as dotenv from 'dotenv';
dotenv.config();

async function main(): Promise<void> {
  const { scrapeDiceEvents } = await import('../src/lib/dice/scraper');
  console.log('[Dice Runner] Starting Dice scraper:', new Date().toISOString());
  
  const result = await scrapeDiceEvents();

  console.log('[Dice Runner] Dice scraper complete:', {
    eventsUpserted: (result.inserted || 0) + (result.updated || 0),
    eventsSkipped: 0,
    errors: result.errors || 0,
  });
}

main()
  .then(() => {
    console.log('[Dice Runner] Exiting successfully');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('[Dice Runner] Fatal error:', error);
    process.exit(1);
  });
