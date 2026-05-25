import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Standalone NYC Parks ingestion script for Railway cron service.
 * Imports the shared ingestion function.
 * Exits 0 on success, 1 on failure.
 */
import { runNYCParksIngestion } from '../src/lib/ingestion/nycParks';

async function main(): Promise<void> {
  console.log('[NYC Parks Sync] Starting:', new Date().toISOString());

  const result = await runNYCParksIngestion();

  console.log('[NYC Parks Sync] Complete:', {
    eventsUpserted: result.eventsUpserted,
    eventsSkipped: result.eventsSkipped,
    errors: result.errors,
    durationMs: result.durationMs,
  });
}

main()
  .then(() => {
    console.log('[NYC Parks Sync] Exiting successfully');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('[NYC Parks Sync] Fatal error:', error);
    process.exit(1);
  });
