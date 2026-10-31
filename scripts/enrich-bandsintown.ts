import * as dotenv from 'dotenv';
dotenv.config();

import { runBandsintownEnrichment } from '../src/lib/enrichment/bandsintown';
import { isDemoModeEnabled } from '../src/lib/utils/demoMode';

async function main(): Promise<void> {
  if (isDemoModeEnabled()) {
    console.log('[Bandsintown Enrichment] DEMO_MODE active — skipping enrichment.');
    return;
  }

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
