/**
 * reset-api-key-counters.ts
 *
 * Standalone script to reset all API key callsToday counters to 0.
 * 
 * Typically this is handled automatically by the auto-reset logic in
 * apiKeyService.ts, but this script serves as a manual fallback and
 * can be scheduled as a nightly cron for defense-in-depth.
 *
 * Usage:
 *   npm run reset:api-counters
 */

import 'dotenv/config';
import { resetAllCallsToday } from '@/lib/db/apiKeyService';

async function main(): Promise<void> {
  console.log('[ResetApiCounters] Resetting all API key call counters...');

  const resetCount = await resetAllCallsToday();

  console.log(`[ResetApiCounters] Done. Reset ${resetCount} API key(s).`);
}

main()
  .catch((err) => {
    console.error('[ResetApiCounters] Fatal error:', err);
    process.exit(1);
  })
  .then(() => process.exit(0));
