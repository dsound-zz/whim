/**
 * Eventbrite ingestion client.
 *
 * Uses the Eventbrite /events/search/ endpoint with a location-based query
 * (lat/lon + radius) to capture all upcoming public events in NYC rather than
 * locking ingestion to pre-configured organizer or venue IDs.
 *
 * This unlocks the full breadth of Eventbrite's catalog: community events,
 * art gallery openings, book readings, food/drink events, comedy shows,
 * workshops, fitness classes, and film screenings that no ticketing platform
 * covers at city scale.
 *
 * Pagination: up to 5 pages × 50 events/page = 250 events per sync.
 * Rate limits: Eventbrite allows ~1,000 API calls/hour for private tokens.
 */

import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { validateEventDates } from '@/lib/utils/validateEventDates';
import { normalizeEventTitle } from '@/lib/utils/normalizeEventTitle';
import { classifyEventCategory } from '@/lib/utils/categorizeEvent';
import { isWithinNYC } from '@/lib/ingestion/location-validation';
import {
  findCanonicalMatch,
  mergeIntoCanonical,
  buildInitialTicketUrls,
  type IncomingEventForDedup,
} from '@/lib/utils/deduplicateAtIngestion';

const EVENTBRITE_API_URL = 'https://www.eventbriteapi.com/v3';

/** NYC center coordinates and search radius for city-wide event discovery. */
const NYC_LAT = 40.7128;
const NYC_LNG = -74.006;
const NYC_SEARCH_RADIUS_KM = 30;

const MAX_PAGES = 5;
const PAGE_SIZE = 50;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function fetchEventbrite(endpoint: string, apiKey: string): Promise<Record<string, unknown>> {
  const url = `${EVENTBRITE_API_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Eventbrite API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ingests upcoming public events from all of NYC using the Eventbrite
 * /events/search/ endpoint. Paginates up to MAX_PAGES pages.
 *
 * Falls back gracefully — if a page fails after the first page has already
 * succeeded, the partial results are kept rather than discarding everything.
 */
export async function ingestEventbriteEvents(apiKey: string | undefined): Promise<{
  inserted: number;
  updated: number;
  errors: number;
  skipped: number;
}> {
  if (!apiKey) {
    throw new Error('EVENTBRITE_API_KEY is missing');
  }

  const allResults = { inserted: 0, updated: 0, errors: 0, skipped: 0 };

  // Eventbrite uses a cursor-based continuation token for pagination.
  let continuationToken: string | null = null;

  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
    try {
      // Build search URL: location-based, live events only, expanding venue + ticket_availability
      let searchUrl =
        `/events/search/` +
        `?location.latitude=${NYC_LAT}` +
        `&location.longitude=${NYC_LNG}` +
        `&location.within=${NYC_SEARCH_RADIUS_KM}km` +
        `&status=live` +
        `&expand=venue,ticket_availability,category,format` +
        `&page_size=${PAGE_SIZE}` +
        `&sort_by=date` +
        `&start_date.range_start=${encodeURIComponent(new Date().toISOString())}`;

      if (continuationToken) {
        searchUrl += `&continuation=${continuationToken}`;
      }

      const data = await fetchEventbrite(searchUrl, apiKey);
      const eventbriteEvents = (data.events as any[]) ?? [];

      if (eventbriteEvents.length === 0) {
        if (pageNumber === 1) {
          console.log('[Eventbrite] No events found in NYC area — check API key and quota.');
        }
        break;
      }

      // Extract continuation token for next page
      const pagination = data.pagination as Record<string, unknown> | undefined;
      continuationToken = (pagination?.continuation as string) ?? null;
      const hasMorePages = (pagination?.has_more_items as boolean) ?? false;

      console.log(
        `[Eventbrite] Page ${pageNumber}: fetched ${eventbriteEvents.length} events` +
          (hasMorePages ? ` (more available)` : ` (last page)`)
      );

      const pageResults = await processEventbritePayload(eventbriteEvents);
      allResults.inserted += pageResults.inserted;
      allResults.updated += pageResults.updated;
      allResults.errors += pageResults.errors;
      allResults.skipped += pageResults.skipped;

      if (!hasMorePages || !continuationToken) {
        console.log('[Eventbrite] Reached last page.');
        break;
      }

      // Polite delay between pages
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`[Eventbrite] Failed on page ${pageNumber}:`, err);
      // Keep partial results if we've already succeeded on earlier pages
      if (pageNumber > 1) break;
      throw err;
    }
  }

  console.log(
    `[Eventbrite] Ingestion complete: inserted=${allResults.inserted}, ` +
      `updated=${allResults.updated}, skipped=${allResults.skipped}, errors=${allResults.errors}`
  );
  return allResults;
}

// ─── Payload processing ───────────────────────────────────────────────────────

async function processEventbritePayload(
  eventbriteEvents: any[]
): Promise<{ inserted: number; updated: number; errors: number; skipped: number }> {
  const results = { inserted: 0, updated: 0, errors: 0, skipped: 0 };

  for (const ebEvent of eventbriteEvents) {
    try {
      const venueData = ebEvent.venue;

      // Skip events without a real venue (purely online events have no lat/lng)
      const isOnlineOnly =
        ebEvent.online_event === true ||
        !venueData?.address?.latitude ||
        !venueData?.address?.longitude;

      if (isOnlineOnly) {
        results.skipped++;
        continue;
      }

      const parsedLat = parseFloat(venueData.address.latitude);
      const parsedLng = parseFloat(venueData.address.longitude);

      // Guard: reject events whose venue coordinates fall outside the NYC bounding box.
      // Eventbrite's location search uses a radius from the center point and can return
      // events in New Jersey, Long Island, or (as seen in production) New Hampshire.
      if (!isWithinNYC(parsedLat, parsedLng)) {
        console.warn(
          `[Eventbrite] Skipping event ${ebEvent.id} "${ebEvent.name?.text}" — ` +
            `venue coordinates (${parsedLat}, ${parsedLng}) are outside the NYC bounding box.`
        );
        results.skipped++;
        continue;
      }

      const rawStartAt = new Date(ebEvent.start.utc);
      const rawEndAt = ebEvent.end?.utc ? new Date(ebEvent.end.utc) : null;
      const dateValidation = validateEventDates(rawStartAt, rawEndAt);
      if (!dateValidation.isValid) {
        console.warn(`[Eventbrite] Skipping event ${ebEvent.id}: ${dateValidation.rejectionReason}`);
        results.skipped++;
        continue;
      }

      const rawTitle = ebEvent.name?.text || 'Unknown Title';
      const normalizedTitle = normalizeEventTitle(rawTitle) ?? rawTitle;

      const ebriteCategory = ebEvent.category?.name;
      const ebriteFormat = ebEvent.format?.name;
      const category = await classifyEventCategory({
        title: normalizedTitle,
        description: ebEvent.description?.text,
        platformTaxonomy: { ebriteCategory, ebriteFormat },
      });

      const eventToInsert = {
        externalId: ebEvent.id,
        sourceType: 'eventbrite_api' as const,
        title: normalizedTitle,
        description: ebEvent.description?.text ?? null,
        category,
        imageUrl: ebEvent.logo?.url ?? null,
        startAt: rawStartAt,
        endAt: dateValidation.sanitizedEndAt,
        venueName: venueData?.name || 'Unknown Venue',
        address: venueData?.address?.localized_address_display || null,
        lat: parsedLat,
        lng: parsedLng,
        isFree: ebEvent.is_free ?? false,
        priceMin: null as number | null,
        priceMax: null as number | null,
        ticketUrl: ebEvent.url,
        platform: 'Eventbrite',
        confidenceScore: 0.9,
        rawSource: ebEvent,
        status: (ebEvent.status === 'live' ? 'active' : 'cancelled') as 'active' | 'cancelled',
      };

      const dedupCandidate: IncomingEventForDedup = {
        externalId: eventToInsert.externalId,
        sourceType: eventToInsert.sourceType,
        title: eventToInsert.title,
        venueName: eventToInsert.venueName,
        lat: eventToInsert.lat,
        lng: eventToInsert.lng,
        startAt: eventToInsert.startAt,
        ticketUrl: eventToInsert.ticketUrl,
        platform: eventToInsert.platform,
        priceMin: eventToInsert.priceMin,
        priceMax: eventToInsert.priceMax,
        isFree: eventToInsert.isFree,
      };

      // Intra-source dedup: same Eventbrite event re-synced
      const existing = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.externalId, eventToInsert.externalId),
            eq(events.sourceType, 'eventbrite_api')
          )
        );

      if (existing.length > 0) {
        await db
          .update(events)
          .set({
            ...eventToInsert,
            ticketUrls: buildInitialTicketUrls(dedupCandidate),
          })
          .where(eq(events.id, existing[0].id));
        results.updated++;
      } else {
        // Cross-platform dedup check before inserting as new canonical event
        const dedupResult = await findCanonicalMatch(dedupCandidate);

        if (dedupResult.isMatch && dedupResult.canonicalEventId) {
          const { confidenceScore: _cs, rawSource: _rs, ...coreFields } = eventToInsert;
          await mergeIntoCanonical(
            dedupResult.canonicalEventId,
            dedupCandidate,
            coreFields,
            dedupResult.shouldUpdateCanonical
          );
          results.skipped++;
        } else {
          await db.insert(events).values({
            ...eventToInsert,
            ticketUrls: buildInitialTicketUrls(dedupCandidate),
          });
          results.inserted++;
        }
      }
    } catch (e) {
      console.error('[Eventbrite] Failed to process event:', ebEvent.id, e);
      results.errors++;
    }
  }

  return results;
}
