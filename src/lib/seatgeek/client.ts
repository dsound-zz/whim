/**
 * SeatGeek API client.
 *
 * Fetches events from the SeatGeek Platform API v2 and normalizes them
 * into the Whim event schema. SeatGeek is particularly strong for sports
 * and concert events, filling gaps that Ticketmaster misses for some venues.
 *
 * API docs: https://platform.seatgeek.com/
 * Auth: client_id query parameter
 * Rate limits: generous (no documented rate limit for basic tier)
 */

import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { validateEventDates } from '@/lib/utils/validateEventDates';
import { normalizeEventTitle } from '@/lib/utils/normalizeEventTitle';
import { classifyEventCategory } from '@/lib/utils/categorizeEvent';
import { estimateEndTime } from '@/lib/utils/estimateEndTime';
import { resolveVenueSafely } from '@/lib/db/venueService';
import {
  findCanonicalMatch,
  mergeIntoCanonical,
  buildInitialTicketUrls,
  type IncomingEventForDedup,
} from '@/lib/utils/deduplicateAtIngestion';

const SEATGEEK_API_URL = 'https://api.seatgeek.com/2';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeatGeekVenue {
  name: string;
  address: string | null;
  city: string;
  state: string;
  postal_code: string;
  location: {
    lat: number;
    lon: number;
  };
}

interface SeatGeekPerformer {
  name: string;
  image: string | null;
  url: string;
}

interface SeatGeekEvent {
  id: number;
  title: string;
  short_title: string;
  description: string | null;
  datetime_utc: string;
  datetime_local: string;
  venue: SeatGeekVenue;
  performers: SeatGeekPerformer[];
  url: string;
  stats: {
    lowest_price: number | null;
    highest_price: number | null;
    average_price: number | null;
  };
  type: string;
  taxonomies: Array<{ name: string }>;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchSeatGeek(
  endpoint: string,
  clientId: string,
  params: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const url = new URL(`${SEATGEEK_API_URL}${endpoint}`);
  url.searchParams.set('client_id', clientId);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`SeatGeek API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function ingestSeatGeekEvents(
  clientId: string | undefined,
  options: { lat?: number; lon?: number; range?: string; maxPages?: number } = {}
): Promise<{ inserted: number; updated: number; skipped: number; errors: number }> {
  if (!clientId) {
    console.warn('[SeatGeek] SEATGEEK_CLIENT_ID is not set. Skipping SeatGeek ingestion — no mock data will be written.');
    return { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  }

  const {
    lat = 40.7128,
    lon = -74.006,
    range = '25mi',
    maxPages = 5,
  } = options;

  const allResults = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    try {
      const data = await fetchSeatGeek('/events', clientId, {
        lat: String(lat),
        lon: String(lon),
        range,
        per_page: '100',
        page: String(pageNumber),
        sort: 'datetime_utc.asc',
      });

      const sgEvents = (data.events as SeatGeekEvent[]) ?? [];
      const meta = data.meta as { total?: number; per_page?: number; page?: number } | undefined;

      if (sgEvents.length === 0) {
        if (pageNumber === 1) {
          console.log('[SeatGeek] No events found in area.');
        }
        break;
      }

      const totalPages = meta?.total && meta?.per_page
        ? Math.ceil(meta.total / meta.per_page)
        : pageNumber;

      console.log(`[SeatGeek] Fetching page ${pageNumber} of ~${totalPages} (${sgEvents.length} events)...`);

      const pageResults = await processSeatGeekPayload(sgEvents);
      allResults.inserted += pageResults.inserted;
      allResults.updated += pageResults.updated;
      allResults.skipped += pageResults.skipped;
      allResults.errors += pageResults.errors;

      // Stop if we've reached the last page
      if (pageNumber >= totalPages) break;

      // Minimal delay between pages
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`[SeatGeek] Failed on page ${pageNumber}:`, err);
      if (pageNumber > 1) break;
      throw err;
    }
  }

  console.log(`[SeatGeek] Ingestion complete: inserted=${allResults.inserted}, updated=${allResults.updated}, skipped=${allResults.skipped}, errors=${allResults.errors}`);
  return allResults;
}

// ─── Payload processing ───────────────────────────────────────────────────────

async function processSeatGeekPayload(
  sgEvents: SeatGeekEvent[]
): Promise<{ inserted: number; updated: number; skipped: number; errors: number }> {
  const results = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const sgEvent of sgEvents) {
    try {
      const rawStartAt = new Date(sgEvent.datetime_utc);
      const dateValidation = validateEventDates(rawStartAt, null);
      if (!dateValidation.isValid) {
        console.warn(`[SeatGeek] Skipping event ${sgEvent.id}: ${dateValidation.rejectionReason}`);
        results.skipped++;
        continue;
      }

      const rawTitle = sgEvent.title || sgEvent.short_title || 'Unknown Title';
      const normalizedTitle = normalizeEventTitle(rawTitle) ?? rawTitle;

      // Map SeatGeek taxonomies to Whim categories
      const sgTaxonomy = sgEvent.taxonomies?.[0]?.name;
      const category = await classifyEventCategory({
        title: normalizedTitle,
        description: sgEvent.description,
        platformTaxonomy: { sgTaxonomy, sgType: sgEvent.type },
      });

      const venue = sgEvent.venue;
      const imageUrl = sgEvent.performers?.[0]?.image ?? null;
      const isFree = sgEvent.stats.lowest_price === 0;

      const sgAddress = venue.address
        ? `${venue.address}, ${venue.city}, ${venue.state} ${venue.postal_code}`
        : `${venue.city}, ${venue.state}`;
      const resolvedVenue = await resolveVenueSafely({
        name: venue.name,
        address: sgAddress,
        lat: venue.location.lat,
        lng: venue.location.lon,
        sourceType: 'seatgeek_api',
      });

      const eventToInsert = {
        externalId: String(sgEvent.id),
        sourceType: 'seatgeek_api' as const,
        title: normalizedTitle,
        description: sgEvent.description ?? null,
        category,
        imageUrl,
        startAt: rawStartAt,
        endAt: dateValidation.sanitizedEndAt ?? estimateEndTime(rawStartAt, category),
        venueId: resolvedVenue?.venueId ?? null,
        venueName: venue.name,
        address: sgAddress,
        lat: resolvedVenue?.lat ?? venue.location.lat,
        lng: resolvedVenue?.lng ?? venue.location.lon,
        isFree,
        priceMin: sgEvent.stats.lowest_price ?? null,
        priceMax: sgEvent.stats.highest_price ?? null,
        currency: 'USD',
        ticketUrl: sgEvent.url,
        platform: 'SeatGeek',
        confidenceScore: 0.9,
        rawSource: sgEvent,
        status: 'active' as const,
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

      // Intra-source dedup
      const existing = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.externalId, eventToInsert.externalId),
            eq(events.sourceType, 'seatgeek_api')
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
        // Cross-platform dedup check
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
    } catch (eventError) {
      console.error(`[SeatGeek] Failed to process event ${sgEvent.id}:`, eventError);
      results.errors++;
    }
  }

  return results;
}
