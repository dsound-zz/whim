/**
 * backfill-eventbrite-scrape-images.ts
 *
 * One-time backfill for eventbrite_scrape events ingested before getImageUrl() in
 * scripts/scrape-eventbrite.ts learned to prefer image.original.url. Some events ended
 * up with a small crop (e.g. h=200&w=267) baked into the stored imageUrl.
 *
 * No re-scrape needed: scrape-eventbrite.ts stores the raw Eventbrite `event` object
 * (including the untouched `image` field) in rawSource, so the corrected imageUrl can
 * be recomputed directly from what's already in the DB.
 *
 * Usage:
 *   npm run backfill:eb-scrape-images                # dry run
 *   npm run backfill:eb-scrape-images -- --execute    # apply
 */

import 'dotenv/config';

import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getEventbriteScrapeImageUrl, type EventbriteScrapedImage } from '@/lib/eventbrite/scrapeImageUrl';

const shouldExecute = process.argv.includes('--execute');

async function main() {
  console.log('[EbScrapeImageBackfill] Mode:', shouldExecute ? 'EXECUTE' : 'DRY RUN (pass --execute to apply)');

  const candidates = await db
    .select({ id: events.id, title: events.title, imageUrl: events.imageUrl, rawSource: events.rawSource })
    .from(events)
    .where(and(eq(events.sourceType, 'eventbrite_scrape'), eq(events.status, 'active')));

  console.log(`[EbScrapeImageBackfill] Checking ${candidates.length} active Eventbrite-scrape events.\n`);

  let upgraded = 0;
  let unchanged = 0;
  let skippedNoRawSource = 0;

  for (const event of candidates) {
    const rawEvent = (event.rawSource as { event?: { image?: EventbriteScrapedImage } } | null)?.event;
    if (!rawEvent) {
      skippedNoRawSource++;
      continue;
    }

    const recomputed = getEventbriteScrapeImageUrl(rawEvent.image);
    if (!recomputed || recomputed === event.imageUrl) {
      unchanged++;
      continue;
    }

    console.log(`  [UPGRADE] ${event.title.slice(0, 60)}`);
    upgraded++;

    if (shouldExecute) {
      await db.update(events).set({ imageUrl: recomputed, updatedAt: new Date() }).where(eq(events.id, event.id));
    }
  }

  console.log('\n─── Summary ───');
  console.log(`  Images upgraded:       ${upgraded}`);
  console.log(`  Already full-res:      ${unchanged}`);
  console.log(`  No rawSource.event:    ${skippedNoRawSource}`);
  if (!shouldExecute) {
    console.log('\n  [DRY RUN] No database changes were made. Pass --execute to apply.');
  }
  process.exit(0);
}

main();
