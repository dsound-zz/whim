import * as dotenv from 'dotenv';
dotenv.config();

import { runEventbriteIngestion } from '../src/lib/ingestion/eventbrite'

async function main(): Promise<void> {
  console.log('[EB Sync] Starting:', new Date().toISOString())

  const result = await runEventbriteIngestion()

  console.log('[EB Sync] Complete:', {
    eventsUpserted: result.eventsUpserted,
    eventsSkipped: result.eventsSkipped,
    errors: result.errors,
    durationMs: result.durationMs,
  })
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[EB Sync] Fatal error:', error)
    process.exit(1)
  })
