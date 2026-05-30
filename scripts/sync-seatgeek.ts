/**
 * sync-seatgeek.ts
 *
 * Standalone cron script for SeatGeek event ingestion.
 * Follows the same pattern as sync-ticketmaster.ts.
 *
 * Usage:
 *   npm run sync:seatgeek
 *
 * Environment variables:
 *   SEATGEEK_CLIENT_ID — required
 */

import 'dotenv/config';
import { ingestSeatGeekEvents } from '@/lib/seatgeek/client';
import { updateIngestionSourceStatus } from '@/lib/db/ingestionService';

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('[SyncSeatGeek] Starting SeatGeek ingestion:', new Date().toISOString());

  const clientId = process.env.SEATGEEK_CLIENT_ID;
  if (!clientId) {
    console.warn('[SyncSeatGeek] SEATGEEK_CLIENT_ID is not set. Running with mock data fallback.');
  }

  try {
    const results = await ingestSeatGeekEvents(clientId, {
      lat: 40.7128,
      lon: -74.006,
      range: '25mi',
      maxPages: 5,
    });

    const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SyncSeatGeek] Done in ${durationSeconds}s — inserted: ${results.inserted}, updated: ${results.updated}, skipped: ${results.skipped}, errors: ${results.errors}`);

    await updateIngestionSourceStatus('seatgeek_api', 'active');
  } catch (error) {
    console.error('[SyncSeatGeek] Fatal error:', error);
    await updateIngestionSourceStatus('seatgeek_api', 'error', String(error));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[SyncSeatGeek] Uncaught error:', err);
  process.exit(1);
});
