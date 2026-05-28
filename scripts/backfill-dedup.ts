import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, and, gte, lte, ne, isNull } from 'drizzle-orm';
import {
  findCanonicalMatch,
  mergeIntoCanonical,
  buildInitialTicketUrls,
  type IncomingEventForDedup,
} from '@/lib/utils/deduplicateAtIngestion';

/**
 * One-time backfill: find cross-platform duplicate events already in the DB
 * and hard-merge them into single canonical rows.
 *
 * Strategy:
 * 1. For each event in the DB (sorted by source trust, highest first),
 *    check if there's a lower-trust duplicate already merged into it.
 * 2. If any matching event from another source exists for the same show,
 *    merge the lower-trust event's ticketUrl into the canonical's ticketUrls
 *    and delete the duplicate row.
 *
 * Safety: performs a dry run first (logs matches without writing) unless
 * --execute flag is passed.
 */

const SOURCE_TRUST: Record<string, number> = {
  ticketmaster_api: 1.0,
  eventbrite_api: 0.9,
  nyc_parks_api: 0.85,
  songkick_scrape: 0.75,
  dice_scrape: 0.7,
  ra_scrape: 0.6,
  scrape: 0.5,
  ical: 0.5,
  rss: 0.45,
  email: 0.4,
  submission: 0.4,
};

const shouldExecute = process.argv.includes('--execute');
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

async function run() {
  console.log(`[DeduplicateBackfill] Starting cross-platform dedup backfill...`);
  console.log(`[DeduplicateBackfill] Mode: ${shouldExecute ? 'EXECUTE (writes to DB)' : 'DRY RUN (no writes)'}`);
  if (!shouldExecute) {
    console.log(`[DeduplicateBackfill] Run with --execute to apply merges.\n`);
  }

  let totalMerged = 0;
  let totalDeleted = 0;
  let totalErrors = 0;

  // Fetch all active events, ordered by trust score descending so high-trust events
  // are processed first and become the canonical
  const allActiveEvents = await db
    .select({
      id: events.id,
      externalId: events.externalId,
      sourceType: events.sourceType,
      title: events.title,
      venueName: events.venueName,
      lat: events.lat,
      lng: events.lng,
      startAt: events.startAt,
      ticketUrl: events.ticketUrl,
      platform: events.platform,
      priceMin: events.priceMin,
      priceMax: events.priceMax,
      isFree: events.isFree,
      mergedSourceIds: events.mergedSourceIds,
    })
    .from(events)
    .where(eq(events.status, 'active'));

  console.log(`[DeduplicateBackfill] Loaded ${allActiveEvents.length} active events.`);

  // Sort by trust: highest trust first
  const sorted = [...allActiveEvents].sort(
    (a, b) => (SOURCE_TRUST[b.sourceType] ?? 0.5) - (SOURCE_TRUST[a.sourceType] ?? 0.5)
  );

  // Track which IDs have already been merged (so we don't process them as canonicals)
  const mergedIds = new Set<string>();

  for (const event of sorted) {
    if (mergedIds.has(event.id)) continue;

    // Find events from other sources that match this one
    const windowStart = new Date(new Date(event.startAt).getTime() - THIRTY_MINUTES_MS);
    const windowEnd = new Date(new Date(event.startAt).getTime() + THIRTY_MINUTES_MS);

    const candidates = allActiveEvents.filter((candidate) => {
      if (candidate.id === event.id) return false;
      if (mergedIds.has(candidate.id)) return false;
      if (candidate.sourceType === event.sourceType) return false;

      const startAtDiff = Math.abs(
        new Date(candidate.startAt).getTime() - new Date(event.startAt).getTime()
      );
      return startAtDiff <= THIRTY_MINUTES_MS;
    });

    for (const candidate of candidates) {
      try {
        const dedupCandidate: IncomingEventForDedup = {
          externalId: candidate.externalId ?? '',
          sourceType: candidate.sourceType,
          title: candidate.title,
          venueName: candidate.venueName,
          lat: candidate.lat,
          lng: candidate.lng,
          startAt: new Date(candidate.startAt),
          ticketUrl: candidate.ticketUrl,
          platform: candidate.platform,
          priceMin: candidate.priceMin,
          priceMax: candidate.priceMax,
          isFree: candidate.isFree,
        };

        // Use the same matching logic as ingestion-time dedup
        const matchResult = await findCanonicalMatch(dedupCandidate);

        if (matchResult.isMatch && matchResult.canonicalEventId === event.id) {
          const eventTrust = SOURCE_TRUST[event.sourceType] ?? 0.5;
          const candidateTrust = SOURCE_TRUST[candidate.sourceType] ?? 0.5;
          const shouldPromote = candidateTrust > eventTrust;

          console.log(
            `[DeduplicateBackfill] MATCH: "${candidate.title}" (${candidate.sourceType}) → canonical "${event.title}" (${event.sourceType})` +
            (shouldPromote ? ' [WILL PROMOTE]' : '')
          );

          if (shouldExecute) {
            // Merge candidate ticket source into canonical
            await mergeIntoCanonical(
              event.id,
              dedupCandidate,
              {},
              shouldPromote
            );

            // Initialize the canonical's own ticketUrls if empty
            const canonicalTicketSource = {
              platform: event.platform ?? 'unknown',
              url: event.ticketUrl,
              priceMin: event.priceMin,
              priceMax: event.priceMax,
              isFree: event.isFree,
            };

            // Delete the now-redundant duplicate row
            await db.delete(events).where(eq(events.id, candidate.id));

            mergedIds.add(candidate.id);
            totalMerged++;
            totalDeleted++;
          } else {
            // Dry run — just count
            totalMerged++;
          }
        }
      } catch (error) {
        console.error(`[DeduplicateBackfill] Error processing candidate ${candidate.id}:`, error);
        totalErrors++;
      }
    }
  }

  console.log('\n[DeduplicateBackfill] Complete.');
  console.log(`  Matches found: ${totalMerged}`);
  if (shouldExecute) {
    console.log(`  Rows deleted:  ${totalDeleted}`);
  }
  console.log(`  Errors:        ${totalErrors}`);

  if (!shouldExecute && totalMerged > 0) {
    console.log(`\n  ⚠️  Run with --execute to apply ${totalMerged} merges to the database.`);
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

run();
