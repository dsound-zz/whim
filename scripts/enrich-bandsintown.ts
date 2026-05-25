import * as dotenv from 'dotenv';
dotenv.config();

import { runBandsintownEnrichment } from '../src/lib/enrichment/bandsintown';

async function main(): Promise<void> {
  console.log('[Bandsintown Enrichment] Starting:', new Date().toISOString());
  const result = await runBandsintownEnrichment();
  console.log('[Bandsintown Enrichment] Complete:', result);
}

main()
  .then(() => {
    console.log('[Bandsintown Enrichment] Exiting successfully');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('[Bandsintown Enrichment] Fatal error:', error);
    process.exit(1);
  });
