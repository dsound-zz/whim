import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Standalone Ticketmaster ingestion script for Railway cron service.
 * Imports the shared ingestion function — no business logic here.
 * Exits 0 on success, 1 on failure so Railway can detect job failures.
 */
import { runTicketmasterIngestion } from '../src/lib/ingestion/ticketmaster'
import { isDemoModeEnabled } from '../src/lib/utils/demoMode'

async function main(): Promise<void> {
  if (isDemoModeEnabled()) {
    console.log('[TM Sync] DEMO_MODE active — skipping sync.')
    return
  }

  console.log('[TM Sync] Starting:', new Date().toISOString())

  const result = await runTicketmasterIngestion()

  console.log('[TM Sync] Complete:', {
    eventsUpserted: result.eventsUpserted,
    eventsSkipped: result.eventsSkipped,
    errors: result.errors,
    durationMs: result.durationMs,
  })
}

main()
  .then(() => {
    console.log('[TM Sync] Exiting successfully')
    process.exit(0)
  })
  .catch((error: unknown) => {
    console.error('[TM Sync] Fatal error:', error)
    process.exit(1)
  })
