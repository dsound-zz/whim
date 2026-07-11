/**
 * Eventbrite NYC event scraper.
 *
 * Replaces the deprecated Eventbrite v3 REST API (permanently 404'd).
 * Fetches events from Eventbrite's public browse pages, which embed all event
 * data in window.__SERVER_DATA__ on the initial HTML response — no browser
 * or Playwright required.
 *
 * Strategy: hit the main events listing (3 pages) plus 6 category-specific
 * pages to maximize coverage and category diversity. Yields ~150-200 unique
 * NYC events per sync across all categories.
 *
 * Venue lat/lng is provided by Eventbrite in SERVER_DATA — geocoding is only
 * needed as a fallback for events with missing coordinates.
 */

import * as dotenv from 'dotenv';
dotenv.config();

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventbriteAddress {
  city: string;
  country: string;
  region: string;
  latitude?: string;
  longitude?: string;
  localized_address_display?: string;
  address_1?: string;
  postal_code?: string;
}

interface EventbriteVenue {
  _type: string;
  name: string;
  id?: string;
  address?: EventbriteAddress;
}

interface EventbriteImage {
  url: string;
  image_sizes?: {
    large?: string;
    medium?: string;
    small?: string;
  };
  original?: { url: string };
}

interface EventbriteTag {
  prefix: string;
  tag: string;
  display_name: string;
}

interface EventbriteEvent {
  id: string;
  eid?: string;
  eventbrite_event_id?: string;
  name: string;
  summary?: string;
  full_description?: string;
  start_date: string;   // "2026-06-15"
  start_time: string;   // "17:30"
  end_date?: string;
  end_time?: string;
  timezone: string;     // "America/New_York"
  url: string;
  tickets_url?: string;
  primary_venue?: EventbriteVenue;
  image?: EventbriteImage;
  tags?: EventbriteTag[];
  is_online_event?: boolean;
  is_cancelled?: boolean;
  is_protected_event?: boolean;
}

// ─── URL list ─────────────────────────────────────────────────────────────────

const EVENTBRITE_PAGES = [
  // Main events listing — broadest mix
  'https://www.eventbrite.com/d/ny--new-york/events/',
  'https://www.eventbrite.com/d/ny--new-york/events/?page=2',
  'https://www.eventbrite.com/d/ny--new-york/events/?page=3',
  // Category pages — fills gaps not covered by the main listing
  'https://www.eventbrite.com/d/ny--new-york/community/',
  'https://www.eventbrite.com/d/ny--new-york/food-and-drink/',
  'https://www.eventbrite.com/d/ny--new-york/sports-and-fitness/',
  'https://www.eventbrite.com/d/ny--new-york/family-and-education/',
  'https://www.eventbrite.com/d/ny--new-york/arts--theatre-and-comedy/',
  'https://www.eventbrite.com/d/ny--new-york/film-and-media/',
];

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ─── Parse helpers ────────────────────────────────────────────────────────────

interface ParsedServerData {
  events: EventbriteEvent[];
  pageCount: number;
}

function extractServerData(html: string): ParsedServerData {
  const match = html.match(/window\.__SERVER_DATA__\s*=\s*(\{[\s\S]*?\});\s*\n/);
  if (!match) return { events: [], pageCount: 1 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return { events: [], pageCount: 1 };
  }

  const allEvents: EventbriteEvent[] = [];

  function tryAddEvents(arr: unknown[]): void {
    for (const ev of arr) {
      if (isEventbriteEvent(ev)) allEvents.push(ev);
    }
  }

  function collect(obj: unknown, depth: number): void {
    if (depth > 12 || !obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) collect(item, depth + 1);
      return;
    }
    const record = obj as Record<string, unknown>;

    // Main events listing: key is 'events'
    if (Array.isArray(record['events'])) tryAddEvents(record['events'] as unknown[]);

    // Category/search pages: key is 'results' or 'promoted_results' inside an events object
    if (Array.isArray(record['results'])) tryAddEvents(record['results'] as unknown[]);
    if (Array.isArray(record['promoted_results'])) tryAddEvents(record['promoted_results'] as unknown[]);

    for (const value of Object.values(record)) {
      collect(value, depth + 1);
    }
  }

  collect(parsed, 0);

  const pageCount =
    typeof (parsed as Record<string, unknown>)['page_count'] === 'number'
      ? ((parsed as Record<string, unknown>)['page_count'] as number)
      : 1;

  return { events: allEvents, pageCount };
}

function isEventbriteEvent(obj: unknown): obj is EventbriteEvent {
  if (!obj || typeof obj !== 'object') return false;
  const record = obj as Record<string, unknown>;
  return (
    typeof record['name'] === 'string' &&
    typeof record['start_date'] === 'string' &&
    typeof record['start_time'] === 'string' &&
    typeof record['url'] === 'string' &&
    (typeof record['id'] === 'string' || typeof record['eid'] === 'string')
  );
}

function getEventId(event: EventbriteEvent): string {
  return event.eventbrite_event_id ?? event.eid ?? event.id;
}

function getImageUrl(event: EventbriteEvent): string | null {
  const img = event.image;
  if (!img) return null;
  return img.image_sizes?.large ?? img.url ?? null;
}

function getVenueCoords(venue: EventbriteVenue): { lat: number; lng: number } | null {
  const addr = venue.address;
  if (!addr?.latitude || !addr?.longitude) return null;
  const lat = parseFloat(addr.latitude);
  const lng = parseFloat(addr.longitude);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

function buildEventAddress(venue: EventbriteVenue): string {
  const addr = venue.address;
  if (!addr) return venue.name;
  return [
    addr.localized_address_display ?? addr.address_1,
    addr.city,
    addr.region,
    addr.postal_code,
  ]
    .filter(Boolean)
    .join(', ');
}

// Build a PlatformTaxonomy object from Eventbrite tags for the category classifier
function buildPlatformTaxonomy(tags: EventbriteTag[]): { ebriteCategory?: string; ebriteFormat?: string } | null {
  const categoryTag = tags.find((t) => t.prefix === 'EventbriteCategory');
  const formatTag = tags.find((t) => t.prefix === 'EventbriteFormat');
  if (!categoryTag && !formatTag) return null;
  return {
    ebriteCategory: categoryTag?.display_name,
    ebriteFormat: formatTag?.display_name,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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

  console.log('[Eventbrite] Starting NYC scrape:', new Date().toISOString());

  // ─── Fetch all pages and collect unique events ─────────────────────────────
  const allEventsById = new Map<string, EventbriteEvent>();
  const MAX_PAGES_PER_URL = 3; // Cap pagination to avoid hammering the server

  // Fetches one page, adds new events to allEventsById, returns { newCount, pageCount }
  async function fetchPage(url: string, label: string): Promise<{ newCount: number; pageCount: number }> {
    let html: string;
    try {
      const response = await fetch(url, { headers: BROWSER_HEADERS });
      if (!response.ok) {
        console.warn(`[Eventbrite] HTTP ${response.status} for ${label} — skipping`);
        return { newCount: 0, pageCount: 1 };
      }
      html = await response.text();
    } catch (fetchError) {
      console.warn(`[Eventbrite] Fetch failed for ${label}:`, fetchError);
      return { newCount: 0, pageCount: 1 };
    }

    const { events: pageEvents, pageCount } = extractServerData(html);
    let newCount = 0;

    for (const event of pageEvents) {
      if (event.is_online_event || event.is_cancelled || event.is_protected_event) continue;
      const id = getEventId(event);
      if (!allEventsById.has(id)) {
        allEventsById.set(id, event);
        newCount++;
      }
    }

    console.log(
      `[Eventbrite] ${label}: ${pageEvents.length} events (${newCount} new, ${allEventsById.size} total)` +
        (pageCount > 1 ? ` [${pageCount} pages available]` : '')
    );

    return { newCount, pageCount };
  }

  // Strip any existing ?page= param from a URL to get the base URL for pagination
  function baseUrl(url: string): string {
    return url.replace(/[?&]page=\d+/, '');
  }

  for (let i = 0; i < EVENTBRITE_PAGES.length; i++) {
    const url = EVENTBRITE_PAGES[i];
    const label = url.split('/d/')[1] ?? url;
    console.log(`[Eventbrite] [${i + 1}/${EVENTBRITE_PAGES.length}] ${url}`);

    const { newCount, pageCount } = await fetchPage(url, label);

    // Paginate category pages (page_count is set on search results pages)
    if (pageCount > 1 && newCount > 0) {
      const pagesToFetch = Math.min(pageCount, MAX_PAGES_PER_URL);
      for (let p = 2; p <= pagesToFetch; p++) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const paginatedUrl = `${baseUrl(url)}?page=${p}`;
        await fetchPage(paginatedUrl, `${label} p${p}`);
      }
    }

    if (i < EVENTBRITE_PAGES.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(`[Eventbrite] Total unique events collected: ${allEventsById.size}`);

  if (allEventsById.size === 0) {
    console.warn('[Eventbrite] No events collected — Eventbrite page structure may have changed.');
    await updateIngestionSourceStatus('eventbrite_scrape', 'error', 'No events collected');
    process.exit(1);
  }

  // ─── Ingest collected events ───────────────────────────────────────────────
  const results = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const event of allEventsById.values()) {
    try {
      // ─── Date / time ─────────────────────────────────────────────────────
      // Eventbrite gives date and time separately; combine with timezone
      const startAt = new Date(`${event.start_date}T${event.start_time}:00`);
      const endAt =
        event.end_date && event.end_time
          ? new Date(`${event.end_date}T${event.end_time}:00`)
          : null;

      const dateValidation = validateEventDates(startAt, endAt);
      if (!dateValidation.isValid) {
        results.skipped++;
        continue;
      }

      // ─── Title ───────────────────────────────────────────────────────────
      const normalizedTitle = normalizeEventTitle(event.name) ?? event.name;

      // ─── Description ─────────────────────────────────────────────────────
      const description = event.full_description ?? event.summary ?? null;

      // ─── Image ───────────────────────────────────────────────────────────
      const imageUrl = getImageUrl(event);

      // ─── Venue & coordinates ──────────────────────────────────────────────
      const venue = event.primary_venue;
      if (!venue?.name) {
        results.skipped++;
        continue;
      }

      const venueName = venue.name;
      const rawAddress = buildEventAddress(venue);

      let lat: number | null = null;
      let lng: number | null = null;
      let resolvedAddress: string | null = rawAddress;

      // Prefer embedded coordinates — avoids Mapbox quota usage
      const embeddedCoords = getVenueCoords(venue);
      if (embeddedCoords) {
        lat = embeddedCoords.lat;
        lng = embeddedCoords.lng;
      } else {
        // Fallback geocode for events without coordinates
        const geocoded = await geocodeWithMapbox(venueName, `${venueName}, ${rawAddress}`);
        if (geocoded) {
          lat = geocoded.lat;
          lng = geocoded.lng;
          resolvedAddress = geocoded.placeName ?? rawAddress;
        }
      }

      if (lat !== null && lng !== null && !isWithinNYC(lat, lng)) {
        console.warn(`[Eventbrite] Skipping "${normalizedTitle}" — outside NYC bbox`);
        results.skipped++;
        continue;
      }

      // ─── Category ────────────────────────────────────────────────────────
      const taxonomy = buildPlatformTaxonomy(event.tags ?? []);
      const category = await classifyEventCategory({
        title: normalizedTitle,
        description,
        platformTaxonomy: taxonomy ?? undefined,
        skipLlmFallback: false,
        defaultCategory: 'other',
      });

      const externalId = getEventId(event);
      const ticketUrl = event.tickets_url ?? event.url;

      const resolvedVenue = await resolveVenueSafely({
        name: venueName,
        address: resolvedAddress,
        lat,
        lng,
        sourceType: 'eventbrite_scrape',
      });

      const eventToInsert = {
        externalId,
        sourceType: 'eventbrite_scrape' as const,
        title: normalizedTitle,
        description,
        category,
        imageUrl,
        startAt,
        endAt: dateValidation.sanitizedEndAt,
        venueId: resolvedVenue?.venueId ?? null,
        venueName,
        address: resolvedAddress,
        lat: resolvedVenue?.lat ?? lat,
        lng: resolvedVenue?.lng ?? lng,
        isFree: false,      // Price not available in SERVER_DATA; assume paid unless TBD
        priceMin: null as number | null,
        priceMax: null as number | null,
        currency: 'USD',
        ticketUrl,
        platform: 'Eventbrite',
        confidenceScore: 0.85,
        rawSource: { event, resolvedAddress },
        status: 'active' as const,
      };

      const dedupCandidate = {
        externalId: eventToInsert.externalId,
        sourceType: eventToInsert.sourceType,
        title: eventToInsert.title,
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

      // ─── Intra-source dedup ───────────────────────────────────────────────
      const existing = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.externalId, externalId),
            eq(events.sourceType, 'eventbrite_scrape')
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
        // ─── Cross-platform dedup ─────────────────────────────────────────
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
      console.error(`[Eventbrite] Failed to process event ${getEventId(event)}:`, eventError);
      results.errors++;
    }
  }

  await updateIngestionSourceStatus('eventbrite_scrape', 'active');

  console.log(
    `[Eventbrite] Scrape complete: ` +
      `inserted=${results.inserted}, updated=${results.updated}, ` +
      `skipped=${results.skipped}, errors=${results.errors}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[Eventbrite Scraper] Fatal error:', error);
    process.exit(1);
  });
