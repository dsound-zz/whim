import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { validateEventDates } from '@/lib/utils/validateEventDates';
import { normalizeEventTitle } from '@/lib/utils/normalizeEventTitle';
import { classifyEventCategory } from '@/lib/utils/categorizeEvent';
import {
  findCanonicalMatch,
  mergeIntoCanonical,
  buildInitialTicketUrls,
  type IncomingEventForDedup,
} from '@/lib/utils/deduplicateAtIngestion';

const TICKETMASTER_API_URL = 'https://app.ticketmaster.com/discovery/v2';

async function fetchTicketmaster(endpoint: string, apiKey: string) {
  const url = new URL(`${TICKETMASTER_API_URL}${endpoint}`);
  url.searchParams.append('apikey', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Ticketmaster API error: ${response.statusText}`);
  }
  return response.json();
}

export async function ingestTicketmasterEvents(apiKey: string | undefined, city = 'New York') {
  if (!apiKey) {
    throw new Error('TicketMaster API Key is required.');
  }

  const maxPages = 10;
  const pageSize = 200;
  const allResults = { inserted: 0, updated: 0, errors: 0, skipped: 0 };

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const searchUrl = `/events.json?city=${encodeURIComponent(city)}&size=${pageSize}&page=${pageNumber}&expand=priceRanges`;
    
    try {
      const data = await fetchTicketmaster(searchUrl, apiKey);
      
      if (!data._embedded || !data._embedded.events) {
        if (pageNumber === 0) {
          console.log('[Ticketmaster] No events found for first page.');
        }
        break;
      }

      const totalPages = data.page?.totalPages ?? 1;
      console.log(`[Ticketmaster] Fetching page ${pageNumber + 1} of ${totalPages} (${data._embedded.events.length} events)...`);

      const pageResults = await processTicketmasterPayload(data._embedded.events);
      allResults.inserted += pageResults.inserted || 0;
      allResults.updated += pageResults.updated || 0;
      allResults.errors += pageResults.errors || 0;
      allResults.skipped += pageResults.skipped || 0;

      // Stop if we've reached the last available page
      if (pageNumber + 1 >= totalPages) {
        console.log('[Ticketmaster] Reached last page.');
        break;
      }

      // Respect rate limits: TM Discovery API allows 5 req/sec
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (err) {
      console.error(`[Ticketmaster] Failed on page ${pageNumber + 1}:`, err);
      // If we got at least some results, don't fail the whole run
      if (pageNumber > 0) break;
      throw err;
    }
  }

  console.log(`[Ticketmaster] Ingestion complete: inserted=${allResults.inserted}, updated=${allResults.updated}, skipped=${allResults.skipped}, errors=${allResults.errors}`);
  return allResults;
}

async function processTicketmasterPayload(tmEvents: any[]) {
  const results = { inserted: 0, updated: 0, errors: 0, skipped: 0 };

  for (const tmEvent of tmEvents) {
    try {
      const venueData = tmEvent._embedded?.venues?.[0];
      const priceData = tmEvent.priceRanges?.[0];

      const rawStartAt = new Date(tmEvent.dates?.start?.dateTime || tmEvent.dates?.start?.localDate);
      const dateValidation = validateEventDates(rawStartAt, null);
      if (!dateValidation.isValid) {
        console.warn(`[Ticketmaster] Skipping event ${tmEvent.id}: ${dateValidation.rejectionReason}`);
        results.skipped++;
        continue;
      }

      const rawTitle = tmEvent.name || 'Unknown Title';
      const normalizedTitle = normalizeEventTitle(rawTitle) ?? rawTitle;

      // Ticketmaster segment = Music, Sports, Arts & Theatre, etc.
      // genre = more specific classification within segment
      const tmSegment = tmEvent.classifications?.[0]?.segment?.name;
      const tmGenre = tmEvent.classifications?.[0]?.genre?.name;
      const category = await classifyEventCategory({
        title: normalizedTitle,
        description: tmEvent.description || tmEvent.info,
        platformTaxonomy: { tmSegment, tmGenre },
      });

      const eventStatus = tmEvent.dates?.status?.code === 'cancelled' ? 'cancelled' : 'active';

      const eventToInsert = {
        externalId: tmEvent.id,
        sourceType: 'ticketmaster_api' as const,
        title: normalizedTitle,
        description: tmEvent.description || tmEvent.info || null,
        category,
        imageUrl: tmEvent.images?.[0]?.url || null,
        startAt: rawStartAt,
        endAt: dateValidation.sanitizedEndAt,
        venueName: venueData?.name || 'Unknown Venue',
        address: venueData ? `${venueData.address?.line1 || ''}, ${venueData.city?.name || ''}`.trim() : null,
        lat: venueData?.location?.latitude ? parseFloat(venueData.location.latitude) : null,
        lng: venueData?.location?.longitude ? parseFloat(venueData.location.longitude) : null,
        isFree: priceData?.min === 0 && priceData?.max === 0,
        priceMin: priceData?.min ?? null,
        priceMax: priceData?.max ?? null,
        currency: priceData?.currency || null,
        ticketUrl: tmEvent.url,
        platform: 'Ticketmaster',
        confidenceScore: 0.95,
        rawSource: tmEvent,
        status: eventStatus as 'active' | 'cancelled',
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

      // Check for existing same-source record (intra-source dedup)
      const existing = await db.select().from(events).where(
        and(eq(events.externalId, eventToInsert.externalId), eq(events.sourceType, 'ticketmaster_api'))
      );

      if (existing.length > 0) {
        // Update the existing same-source record
        await db.update(events).set({
          ...eventToInsert,
          ticketUrls: buildInitialTicketUrls(dedupCandidate),
        }).where(eq(events.id, existing[0].id));
        results.updated++;
      } else {
        // Cross-platform dedup check before inserting
        const dedupResult = await findCanonicalMatch(dedupCandidate);

        if (dedupResult.isMatch && dedupResult.canonicalEventId) {
          // A canonical row already exists — merge this source into it
          const { confidenceScore: _cs, rawSource: _rs, ...coreFields } = eventToInsert;
          await mergeIntoCanonical(
            dedupResult.canonicalEventId,
            dedupCandidate,
            coreFields,
            dedupResult.shouldUpdateCanonical
          );
          results.skipped++;
        } else {
          // No canonical found — this is a new event; initialize its ticketUrls
          await db.insert(events).values({
            ...eventToInsert,
            ticketUrls: buildInitialTicketUrls(dedupCandidate),
          });
          results.inserted++;
        }
      }
    } catch (e) {
      console.error('Failed to process Ticketmaster event:', tmEvent.id, e);
      results.errors++;
    }
  }

  return results;
}
