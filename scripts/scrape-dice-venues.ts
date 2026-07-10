import * as dotenv from 'dotenv';
dotenv.config();

async function main(): Promise<void> {
  const { scrapeDiceVenueEvents } = await import('../src/lib/dice/venueCrawler');
  console.log('[Dice Venue Runner] Starting Dice per-venue crawl:', new Date().toISOString());

  const result = await scrapeDiceVenueEvents();

  console.log('[Dice Venue Runner] Dice per-venue crawl complete:', {
    eventsInserted: result.inserted,
    eventsUpdated: result.updated,
    errors: result.errors,
  });
}

main()
  .then(() => {
    console.log('[Dice Venue Runner] Exiting successfully');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('[Dice Venue Runner] Fatal error:', error);
    process.exit(1);
  });
