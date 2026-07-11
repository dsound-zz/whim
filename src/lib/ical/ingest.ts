/**
 * iCal feed ingestion orchestrator.
 *
 * Processes a single iCal feed source row from ingestion_sources:
 *   1. Calls the iCal client to fetch + parse + normalize events
 *   2. For each normalized event, runs same-source dedup (by externalId)
 *      then cross-platform dedup (findCanonicalMatch) before inserting
 *   3. Updates ingestion_sources.lastSyncedAt and syncStatus on completion
 *
 * This module mirrors the pattern established in nycParks.ts.
 */

import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { fetchAndParseICalFeed } from '@/lib/ical/client';
import {
  findCanonicalMatch,
  mergeIntoCanonical,
  buildInitialTicketUrls,
  type IncomingEventForDedup,
} from '@/lib/utils/deduplicateAtIngestion';
import { updateIngestionSourceStatus } from '@/lib/db/ingestionService';
import { resolveVenueSafely } from '@/lib/db/venueService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ICalIngestionSource {
  /** ingestion_sources.id — used to update status after sync */
  id: string;
  /** The .ics feed URL (from ingestion_sources.config.feedUrl) */
  feedUrl: string;
  /**
   * Canonical venue name to use when the LOCATION field is absent.
   * Stored in ingestion_sources.config.defaultVenueName.
   */
  defaultVenueName: string;
}

export interface IngestionResult {
  eventsInserted: number;
  eventsUpdated: number;
  eventsMerged: number;
  eventsSkipped: number;
  errors: number;
  durationMs: number;
}

// ─── Core ingest function ─────────────────────────────────────────────────────

/**
 * Ingests all events from a single iCal feed source.
 * Returns an IngestionResult summary.
 */
export async function ingestICalFeed(
  source: ICalIngestionSource
): Promise<IngestionResult> {
  const startTime = Date.now();
  let eventsInserted = 0;
  let eventsUpdated = 0;
  let eventsMerged = 0;
  let eventsSkipped = 0;
  let errorsCount = 0;

  console.log(`[iCal Ingest] Starting feed: ${source.feedUrl}`);

  try {
    const { events: normalizedEvents, feedTitle, errors: parseErrors } =
      await fetchAndParseICalFeed({
        feedUrl: source.feedUrl,
        defaultVenueName: source.defaultVenueName,
        expansionDays: 60,
      });

    errorsCount += parseErrors.length;

    if (feedTitle) {
      console.log(`[iCal Ingest] Feed title: "${feedTitle}"`);
    }

    console.log(`[iCal Ingest] Processing ${normalizedEvents.length} events...`);

    for (const normalizedEvent of normalizedEvents) {
      try {
        const resolvedVenue = await resolveVenueSafely({
          name: normalizedEvent.venueName ?? 'Unknown Venue',
          address: normalizedEvent.address,
          lat: normalizedEvent.lat,
          lng: normalizedEvent.lng,
          sourceType: 'ical',
        });

        const eventToInsert = {
          externalId: normalizedEvent.externalId,
          sourceType: 'ical' as const,
          title: normalizedEvent.title,
          description: normalizedEvent.description,
          category: normalizedEvent.category as typeof events.$inferInsert.category,
          imageUrl: normalizedEvent.imageUrl,
          startAt: normalizedEvent.startAt,
          endAt: normalizedEvent.endAt,
          recurrenceRule: normalizedEvent.recurrenceRule,
          venueId: resolvedVenue?.venueId ?? null,
          venueName: normalizedEvent.venueName,
          address: normalizedEvent.address,
          lat: resolvedVenue?.lat ?? normalizedEvent.lat,
          lng: resolvedVenue?.lng ?? normalizedEvent.lng,
          isFree: normalizedEvent.isFree,
          priceMin: normalizedEvent.priceMin,
          priceMax: normalizedEvent.priceMax,
          currency: normalizedEvent.currency,
          ticketUrl: normalizedEvent.ticketUrl,
          platform: normalizedEvent.platform,
          confidenceScore: normalizedEvent.confidenceScore,
          status: 'active' as const,
          rawSource: { uid: normalizedEvent.uid, feedUrl: source.feedUrl },
        };

        const dedupCandidate: IncomingEventForDedup = {
          externalId: normalizedEvent.externalId,
          sourceType: 'ical',
          title: normalizedEvent.title,
          venueName: normalizedEvent.venueName,
          lat: normalizedEvent.lat,
          lng: normalizedEvent.lng,
          startAt: normalizedEvent.startAt,
          ticketUrl: normalizedEvent.ticketUrl,
          platform: normalizedEvent.platform,
          priceMin: normalizedEvent.priceMin,
          priceMax: normalizedEvent.priceMax,
          isFree: normalizedEvent.isFree,
        };

        // ─── Same-source dedup ─────────────────────────────────────────────
        // The (externalId, sourceType) unique index handles concurrent inserts,
        // but we check first so we can route to UPDATE vs INSERT correctly.
        const existingRow = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.externalId, normalizedEvent.externalId),
              eq(events.sourceType, 'ical')
            )
          )
          .limit(1);

        if (existingRow.length > 0) {
          // Event already exists from a previous sync — update mutable fields
          await db
            .update(events)
            .set({
              title: eventToInsert.title,
              description: eventToInsert.description,
              category: eventToInsert.category,
              imageUrl: eventToInsert.imageUrl,
              startAt: eventToInsert.startAt,
              endAt: eventToInsert.endAt,
              venueName: eventToInsert.venueName,
              address: eventToInsert.address,
              lat: eventToInsert.lat,
              lng: eventToInsert.lng,
              isFree: eventToInsert.isFree,
              priceMin: eventToInsert.priceMin,
              ticketUrl: eventToInsert.ticketUrl,
              status: 'active',
              updatedAt: new Date(),
            })
            .where(eq(events.id, existingRow[0].id));
          eventsUpdated++;
          continue;
        }

        // ─── Cross-platform dedup ──────────────────────────────────────────
        const dedupResult = await findCanonicalMatch(dedupCandidate);

        if (dedupResult.isMatch && dedupResult.canonicalEventId) {
          const { confidenceScore: _cs, rawSource: _rs, ...coreFields } = eventToInsert;
          await mergeIntoCanonical(
            dedupResult.canonicalEventId,
            dedupCandidate,
            coreFields,
            dedupResult.shouldUpdateCanonical
          );
          eventsMerged++;
        } else {
          // Brand new event — insert with initialized ticketUrls
          await db
            .insert(events)
            .values({
              ...eventToInsert,
              ticketUrls: buildInitialTicketUrls(dedupCandidate),
            })
            .onConflictDoUpdate({
              // Fallback in case of a race between the select and insert
              target: [events.externalId, events.sourceType],
              set: {
                title: eventToInsert.title,
                startAt: eventToInsert.startAt,
                endAt: eventToInsert.endAt,
                status: 'active',
                updatedAt: new Date(),
              },
            });
          eventsInserted++;
        }
      } catch (eventError) {
        console.error(
          `[iCal Ingest] Failed to upsert event "${normalizedEvent.externalId}":`,
          eventError
        );
        errorsCount++;
      }
    }

    await updateIngestionSourceStatus('ical', 'active');

    const durationMs = Date.now() - startTime;
    console.log(
      `[iCal Ingest] Done (${durationMs}ms): ` +
        `inserted=${eventsInserted}, updated=${eventsUpdated}, ` +
        `merged=${eventsMerged}, skipped=${eventsSkipped}, errors=${errorsCount}`
    );

    return { eventsInserted, eventsUpdated, eventsMerged, eventsSkipped, errors: errorsCount, durationMs };
  } catch (fatalError) {
    await updateIngestionSourceStatus('ical', 'error', String(fatalError));
    throw fatalError;
  }
}
