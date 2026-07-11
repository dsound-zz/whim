/**
 * Resident Advisor (RA) GraphQL scraper.
 *
 * Replaces the previous Playwright DOM scraper, which was blocked by
 * DataDome CAPTCHA. RA's GraphQL API (https://ra.co/graphql) returns
 * structured event data directly — no browser rendering required.
 *
 * NYC area ID = 8 (confirmed via the /areas query).
 * Paginates up to MAX_PAGES × PAGE_SIZE events per sync.
 */

import * as dotenv from 'dotenv';
dotenv.config();

async function main(): Promise<void> {
  const { db } = await import('../src/db');
  const { events } = await import('../src/db/schema');
  const { eq, and } = await import('drizzle-orm');
  const { validateEventDates } = await import('../src/lib/utils/validateEventDates');
  const { normalizeEventTitle } = await import('../src/lib/utils/normalizeEventTitle');
  const { classifyEventCategory } = await import('../src/lib/utils/categorizeEvent');
  const { geocodeWithMapbox } = await import('../src/lib/utils/geocode');
  const { isWithinNYC } = await import('../src/lib/ingestion/location-validation');
  const { updateIngestionSourceStatus } = await import('../src/lib/db/ingestionService');
  const { resolveVenueSafely } = await import('../src/lib/db/venueService');
  const {
    findCanonicalMatch,
    mergeIntoCanonical,
    buildInitialTicketUrls,
  } = await import('../src/lib/utils/deduplicateAtIngestion');

  console.log('[RA] Starting GraphQL scrape:', new Date().toISOString());

  // ─── Config ────────────────────────────────────────────────────────────────

  const RA_GRAPHQL_URL = 'https://ra.co/graphql';
  const RA_NYC_AREA_ID = 8;
  const PAGE_SIZE = 50;
  const MAX_PAGES = 6; // 300 events max per sync

  // Fetch events covering the next 30 days
  const today = new Date();
  const thirtyDaysOut = new Date(today);
  thirtyDaysOut.setDate(today.getDate() + 30);
  const dateFrom = today.toISOString().split('T')[0];
  const dateTo = thirtyDaysOut.toISOString().split('T')[0];

  const GRAPHQL_QUERY = `
    query GET_DEFAULT_EVENTS_LISTING(
      $filters: FilterInputDtoInput
      $pageSize: Int
      $page: Int
      $sort: SortInputDtoInput
    ) {
      eventListings(
        filters: $filters
        pageSize: $pageSize
        page: $page
        sort: $sort
      ) {
        data {
          id
          event {
            id
            title
            date
            startTime
            endTime
            contentUrl
            flyerFront
            images {
              filename
            }
            venue {
              name
              address
              contentUrl
            }
          }
        }
        totalResults
      }
    }
  `;

  // ─── Fetch helper ──────────────────────────────────────────────────────────

  async function fetchRAEvents(page: number): Promise<{
    data: RaEventListing[];
    totalResults: number;
  }> {
    const response = await fetch(RA_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://ra.co/events/us/newyork',
        Origin: 'https://ra.co',
      },
      body: JSON.stringify({
        operationName: 'GET_DEFAULT_EVENTS_LISTING',
        variables: {
          filters: {
            areas: { eq: RA_NYC_AREA_ID },
            listingDate: { gte: dateFrom, lte: dateTo },
          },
          pageSize: PAGE_SIZE,
          page,
          sort: { scoringDate: { order: 'DESCENDING' } },
        },
        query: GRAPHQL_QUERY,
      }),
    });

    if (!response.ok) {
      throw new Error(`RA GraphQL request failed: HTTP ${response.status}`);
    }

    const json = await response.json() as {
      data?: { eventListings?: { data: RaEventListing[]; totalResults: number } };
      errors?: { message: string }[];
    };

    if (json.errors?.length) {
      throw new Error(`RA GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`);
    }

    return {
      data: json.data?.eventListings?.data ?? [],
      totalResults: json.data?.eventListings?.totalResults ?? 0,
    };
  }

  // ─── Types ─────────────────────────────────────────────────────────────────

  interface RaEventListing {
    id: string;
    event: {
      id: string;
      title: string;
      date: string;        // "2026-06-05T00:00:00.000"
      startTime: string;   // "2026-06-05T22:00:00.000"
      endTime: string | null;
      contentUrl: string;  // "/events/2383466"
      flyerFront: string | null;
      images: { filename: string }[];
      venue: {
        name: string;
        address: string;   // "52-19 Flushing Ave., Queens, NY 11378 USA"
        contentUrl: string;
      };
    };
  }

  // ─── Main ingestion loop ───────────────────────────────────────────────────

  const results = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  let totalFetched = 0;

  try {
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      let listings: RaEventListing[];
      let totalResults: number;

      try {
        ({ data: listings, totalResults } = await fetchRAEvents(pageNum));
      } catch (fetchError) {
        console.error(`[RA] Failed to fetch page ${pageNum}:`, fetchError);
        if (pageNum === 1) throw fetchError;
        break;
      }

      if (listings.length === 0) {
        console.log(`[RA] No events on page ${pageNum} — stopping.`);
        break;
      }

      console.log(
        `[RA] Page ${pageNum}: ${listings.length} events (${totalResults} total available)`
      );
      totalFetched += listings.length;

      for (const listing of listings) {
        const { event } = listing;
        if (!event?.id || !event.title) continue;

        try {
          // ─── Date / time ─────────────────────────────────────────────────
          const startAt = new Date(event.startTime || event.date);
          const endAt = event.endTime ? new Date(event.endTime) : null;

          const dateValidation = validateEventDates(startAt, endAt);
          if (!dateValidation.isValid) {
            results.skipped++;
            continue;
          }

          // ─── Title ───────────────────────────────────────────────────────
          const normalizedTitle = normalizeEventTitle(event.title) ?? event.title;

          // ─── Image ───────────────────────────────────────────────────────
          const imageUrl =
            event.flyerFront ??
            event.images?.[0]?.filename ??
            null;

          // ─── Venue & geocoding ────────────────────────────────────────────
          const venueName = event.venue?.name || 'TBA';
          const rawAddress = event.venue?.address || null;

          let lat: number | null = null;
          let lng: number | null = null;
          let resolvedAddress = rawAddress;

          // RA provides full addresses — parse lat/lng from geocoder
          if (venueName && venueName !== 'TBA') {
            const query = rawAddress
              ? `${venueName}, ${rawAddress}`
              : `${venueName}, New York City, NY, USA`;
            const geocoded = await geocodeWithMapbox(venueName, query);
            if (geocoded) {
              lat = geocoded.lat;
              lng = geocoded.lng;
              resolvedAddress = geocoded.placeName ?? rawAddress;
            }
          }

          // Reject events geocoded outside NYC bounding box
          if (lat !== null && lng !== null && !isWithinNYC(lat, lng)) {
            console.warn(
              `[RA] Skipping "${normalizedTitle}" — venue outside NYC bbox (${lat}, ${lng})`
            );
            results.skipped++;
            continue;
          }

          // ─── Category ────────────────────────────────────────────────────
          // RA is nightlife and electronic music — skip LLM fallback
          const category = await classifyEventCategory({
            title: normalizedTitle,
            description: null,
            skipLlmFallback: true,
            defaultCategory: 'music',
          });

          const ticketUrl = `https://ra.co${event.contentUrl}`;

          const resolvedVenue = await resolveVenueSafely({
            name: venueName,
            address: resolvedAddress,
            lat,
            lng,
            sourceType: 'ra_scrape',
          });

          const eventToInsert = {
            externalId: event.id,
            sourceType: 'ra_scrape' as const,
            title: normalizedTitle,
            description: null as string | null,
            category,
            imageUrl,
            startAt,
            endAt: dateValidation.sanitizedEndAt,
            venueId: resolvedVenue?.venueId ?? null,
            venueName,
            address: resolvedAddress,
            lat: resolvedVenue?.lat ?? lat,
            lng: resolvedVenue?.lng ?? lng,
            isFree: false,     // RA events are almost universally ticketed
            priceMin: null as number | null,
            priceMax: null as number | null,
            currency: 'USD',
            ticketUrl,
            platform: 'Resident Advisor',
            confidenceScore: 0.85,  // Higher confidence — structured API data
            rawSource: { listing, resolvedAddress },
            status: 'active' as const,
          };

          const dedupCandidate = {
            externalId: eventToInsert.externalId,
            sourceType: eventToInsert.sourceType,
            title: eventToInsert.title,
            venueId: eventToInsert.venueId,
            venueName: eventToInsert.venueName,
            lat: eventToInsert.lat,
            lng: eventToInsert.lng,
            startAt: eventToInsert.startAt,
            ticketUrl: eventToInsert.ticketUrl,
            platform: eventToInsert.platform,
            priceMin: null,
            priceMax: null,
            isFree: false,
          };

          // ─── Intra-source dedup ───────────────────────────────────────────
          const existing = await db
            .select({ id: events.id })
            .from(events)
            .where(
              and(
                eq(events.externalId, event.id),
                eq(events.sourceType, 'ra_scrape')
              )
            )
            .limit(1);

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
            // ─── Cross-platform dedup ──────────────────────────────────────
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
          console.error(`[RA] Failed to upsert event ${event.id}:`, eventError);
          results.errors++;
        }
      }

      // Polite delay between pages
      if (pageNum < MAX_PAGES && listings.length === PAGE_SIZE) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        break;
      }
    }

    await updateIngestionSourceStatus('ra_scrape', 'active');

    console.log(
      `[RA] Scrape complete: fetched=${totalFetched}, ` +
        `inserted=${results.inserted}, updated=${results.updated}, ` +
        `skipped=${results.skipped}, errors=${results.errors}`
    );
  } catch (fatalError) {
    console.error('[RA] Fatal error:', fatalError);
    await updateIngestionSourceStatus('ra_scrape', 'error', String(fatalError));
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[RA Scraper] Fatal error:', error);
    process.exit(1);
  });
