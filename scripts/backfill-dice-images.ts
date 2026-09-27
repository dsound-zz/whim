/**
 * backfill-dice-images.ts
 *
 * One-time backfill for Dice events ingested before the image-extraction fix in
 * src/lib/dice/scraper.ts. Two categories of bad imageUrl exist in the DB:
 *
 *  1. Literal lazy-load placeholder ("/static/images/1px.png") — the DOM scrape read
 *     the card's <img src> before Dice's lazy loader swapped in the real image. There
 *     is no usable URL stored at all, so this requires re-fetching the detail page's
 *     JSON-LD `image` field over HTTP.
 *  2. A real but tiny imgix thumbnail (w=204&h=204, sized for Dice's listing grid).
 *     This can be fixed with a pure URL rewrite — no network call needed.
 *
 * Usage:
 *   npm run backfill:dice-images                  # dry run
 *   npm run backfill:dice-images -- --execute      # apply
 *   npm run backfill:dice-images -- --limit 50 --execute
 */

import 'dotenv/config';

import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import { fetchDiceEventDetailViaHttp, resolveDiceImageUrl } from '@/lib/dice/scraper';

const args = process.argv.slice(2);
const shouldExecute = args.includes('--execute');
function getArgValue(flag: string): string | undefined {
  const flagIndex = args.indexOf(flag);
  if (flagIndex === -1 || flagIndex + 1 >= args.length) return undefined;
  return args[flagIndex + 1];
}
const limitValue = parseInt(getArgValue('--limit') ?? '500', 10);

async function main() {
  console.log('[DiceImageBackfill] Mode:', shouldExecute ? 'EXECUTE' : 'DRY RUN (pass --execute to apply)');

  const candidates = await db
    .select({ id: events.id, title: events.title, imageUrl: events.imageUrl, ticketUrl: events.ticketUrl })
    .from(events)
    .where(and(eq(events.sourceType, 'dice_scrape'), eq(events.status, 'active'), isNotNull(events.imageUrl)))
    .orderBy(events.startAt)
    .limit(limitValue);

  console.log(`[DiceImageBackfill] Checking ${candidates.length} active Dice events.\n`);

  let placeholderRecovered = 0;
  let placeholderStillMissing = 0;
  let upsized = 0;
  let unchanged = 0;
  let errors = 0;

  for (const event of candidates) {
    const shortTitle = event.title.slice(0, 60);
    try {
      const isPlaceholder = !event.imageUrl!.startsWith('http') || /1px\.png$/i.test(event.imageUrl!);

      let nextImageUrl: string | null;
      if (isPlaceholder) {
        if (!event.ticketUrl) {
          placeholderStillMissing++;
          continue;
        }
        const detail = await fetchDiceEventDetailViaHttp(event.ticketUrl);
        nextImageUrl = resolveDiceImageUrl(detail.imageUrl, null);
        if (!nextImageUrl) {
          console.log(`  [MISS]    ${shortTitle} — detail page had no JSON-LD image either`);
          placeholderStillMissing++;
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }
        console.log(`  [RECOVER] ${shortTitle}`);
        placeholderRecovered++;
        await new Promise((resolve) => setTimeout(resolve, 200));
      } else {
        nextImageUrl = resolveDiceImageUrl(null, event.imageUrl);
        if (nextImageUrl === event.imageUrl) {
          unchanged++;
          continue;
        }
        console.log(`  [UPSIZE]  ${shortTitle}`);
        upsized++;
      }

      if (shouldExecute) {
        await db.update(events).set({ imageUrl: nextImageUrl, updatedAt: new Date() }).where(eq(events.id, event.id));
      }
    } catch (error) {
      console.error(`  [ERROR]   ${shortTitle}:`, error instanceof Error ? error.message : error);
      errors++;
    }
  }

  console.log('\n─── Summary ───');
  console.log(`  Placeholder rows recovered:  ${placeholderRecovered}`);
  console.log(`  Placeholder rows still bad:  ${placeholderStillMissing}`);
  console.log(`  Thumbnails upsized:          ${upsized}`);
  console.log(`  Already full-res:            ${unchanged}`);
  console.log(`  Errors:                      ${errors}`);
  if (!shouldExecute) {
    console.log('\n  [DRY RUN] No database changes were made. Pass --execute to apply.');
  }
  process.exit(errors > 0 ? 1 : 0);
}

main();
