import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  findCanonicalMatch,
  mergeIntoCanonical,
  type IncomingEventForDedup,
} from '@/lib/utils/deduplicateAtIngestion';

/**
 * One-time backfill: merge duplicate active Ticketmaster rows that predate the
 * allowSameSource fix in ingestTicketmasterEvents().
 *
 * Ticketmaster issues a distinct externalId for the primary box-office
 * listing and the resale/marketplace listing of the same show (e.g. "Hamilton"
 * and "Hamilton (NY)" at an identical startAt). Both were previously stored as
 * separate rows because findCanonicalMatch excluded same-source candidates by
 * default, so the (externalId, sourceType) unique index was the only guard —
 * and it never fires here, since the two externalIds genuinely differ.
 *
 * Mirrors backfill-dedup.ts's canonical/candidate loop shape, scoped to
 * ticketmaster_api and inverted to compare *within* one source instead of
 * across sources. The outer loop nominates each not-yet-merged event as a
 * canonical (earliest-created first) and only merges a candidate into it when
 * findCanonicalMatch resolves back to that specific id — findCanonicalMatch's
 * own query has no notion of "which duplicate should win", so a flat
 * one-pass-per-row loop can pick either side of a pair depending on
 * arbitrary SQL result order. excludeEventId is required on the call since,
 * unlike at ingestion time, the candidate row already exists in the DB and
 * would otherwise match itself.
 *
 * Trust is tied (both ticketmaster_api), so the earliest-created row in each
 * pair is always the canonical.
 *
 * Usage:
 *   npx tsx -r dotenv/config -r tsconfig-paths/register scripts/backfill-ticketmaster-dupes.ts            # dry run
 *   npx tsx -r dotenv/config -r tsconfig-paths/register scripts/backfill-ticketmaster-dupes.ts --execute  # apply
 */

const shouldExecute = process.argv.includes('--execute');
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

async function run(): Promise<void> {
  console.log('[TMDupeBackfill] Starting Ticketmaster same-source dedup backfill...');
  console.log(`[TMDupeBackfill] Mode: ${shouldExecute ? 'EXECUTE (writes to DB)' : 'DRY RUN (no writes)'}`);
  if (!shouldExecute) {
    console.log('[TMDupeBackfill] Run with --execute to apply merges.\n');
  }

  const tmEvents = await db
    .select({
      id: events.id,
      externalId: events.externalId,
      sourceType: events.sourceType,
      title: events.title,
      venueId: events.venueId,
      venueName: events.venueName,
      lat: events.lat,
      lng: events.lng,
      startAt: events.startAt,
      ticketUrl: events.ticketUrl,
      platform: events.platform,
      priceMin: events.priceMin,
      priceMax: events.priceMax,
      isFree: events.isFree,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(and(eq(events.sourceType, 'ticketmaster_api'), eq(events.status, 'active')));

  console.log(`[TMDupeBackfill] Loaded ${tmEvents.length} active Ticketmaster events.`);

  // Earliest-created first, so a pair's earlier row is always considered as
  // the canonical before its later duplicate.
  const sorted = [...tmEvents].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const toDedupCandidate = (row: (typeof sorted)[number]): IncomingEventForDedup => ({
    externalId: row.externalId ?? '',
    sourceType: row.sourceType,
    title: row.title,
    venueId: row.venueId,
    venueName: row.venueName,
    lat: row.lat,
    lng: row.lng,
    startAt: new Date(row.startAt),
    ticketUrl: row.ticketUrl,
    platform: row.platform,
    priceMin: row.priceMin,
    priceMax: row.priceMax,
    isFree: row.isFree,
  });

  const mergedIds = new Set<string>();
  let totalMerged = 0;
  let totalErrors = 0;

  for (const event of sorted) {
    if (mergedIds.has(event.id)) continue;

    const candidates = sorted.filter((row) => {
      if (row.id === event.id) return false;
      if (mergedIds.has(row.id)) return false;
      const diff = Math.abs(new Date(row.startAt).getTime() - new Date(event.startAt).getTime());
      return diff <= THIRTY_MINUTES_MS;
    });

    for (const candidate of candidates) {
      try {
        const dedupCandidate = toDedupCandidate(candidate);
        const matchResult = await findCanonicalMatch(dedupCandidate, {
          allowSameSource: true,
          excludeEventId: candidate.id,
        });

        if (!matchResult.isMatch || matchResult.canonicalEventId !== event.id) continue;

        console.log(
          `[TMDupeBackfill] MATCH: "${candidate.title}" (${candidate.externalId}) -> canonical "${event.title}" (${event.externalId})`
        );

        if (shouldExecute) {
          await mergeIntoCanonical(event.id, dedupCandidate, {}, matchResult.shouldUpdateCanonical);
          await db.delete(events).where(eq(events.id, candidate.id));
        }

        mergedIds.add(candidate.id);
        totalMerged++;
      } catch (error) {
        console.error(`[TMDupeBackfill] Error processing candidate ${candidate.id}:`, error);
        totalErrors++;
      }
    }
  }

  console.log('\n[TMDupeBackfill] Complete.');
  console.log(`  Matches found: ${totalMerged}`);
  if (shouldExecute) console.log(`  Rows deleted:  ${totalMerged}`);
  console.log(`  Errors:        ${totalErrors}`);
  if (!shouldExecute && totalMerged > 0) {
    console.log(`\n  Run with --execute to apply ${totalMerged} merges to the database.`);
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

run();
