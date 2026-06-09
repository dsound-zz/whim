/**
 * NYC Permitted Events ingestion.
 *
 * Pulls from the NYC Office of Citywide Event Coordination and Management
 * (CECM) permitted events dataset on NYC Open Data (Socrata, dataset tvpp-9vvx).
 * No API key required.
 *
 * Ingests event types that represent genuinely public, visitor-facing activities:
 *   - Farmers Market       → food_drink  (greenmarkets, community markets)
 *   - Plaza Partner Event  → community   (outdoor concerts, fitness, circus arts at public plazas)
 *   - Open Street Partner  → community   (community open streets programming)
 *   - Block Party          → community   (neighborhood block parties)
 *   - Parade               → community   (public parades)
 *   - Street Festival      → community   (street/block festivals)
 *   - Single Block Festival→ community
 *   - Athletic Race / Tour → fitness     (5Ks, charity runs, bike tours)
 *
 * Location geocoding: the dataset gives a street range or park name rather than
 * coordinates. The script normalizes the location string into a geocodable address
 * and falls back gracefully if Mapbox can't resolve it.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import type { WhimCategory } from '../src/lib/utils/categorizeEvent';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NycPermitEvent {
  event_id: string;
  event_name: string;
  start_date_time: string;   // "2026-06-10T08:00:00.000"
  end_date_time?: string;
  event_agency: string;
  event_type: string;
  event_borough: string;     // "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"
  event_location: string;    // "STREET between CROSS1 and CROSS2" or "PARK NAME: AREA"
  event_street_side?: string;
  street_closure_type?: string;
  community_board?: string;
  police_precinct?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SOCRATA_BASE = 'https://data.cityofnewyork.us/resource/tvpp-9vvx.json';

// Event types that represent publicly accessible, visitor-facing activities
const PUBLIC_EVENT_TYPES = [
  'Farmers Market',
  'Plaza Partner Event',
  'Open Street Partner Event',
  'Block Party',
  'Parade',
  'Street Festival',
  'Single Block Festival',
  'Athletic Race / Tour',
];

const DAYS_AHEAD = 60;
const PAGE_SIZE = 1000;

// ─── Category mapping ─────────────────────────────────────────────────────────

function mapEventTypeToCategory(eventType: string): WhimCategory {
  switch (eventType) {
    case 'Farmers Market':
      return 'food_drink';
    case 'Athletic Race / Tour':
      return 'fitness';
    default:
      return 'community';
  }
}

// ─── Location normalization ───────────────────────────────────────────────────

/**
 * Converts NYC permit location strings to a geocodable address.
 *
 * Input formats:
 *   "PARK NAME: SPECIFIC AREA"  → "Park Name, Borough, NYC"
 *   "STREET between CROSS1 and CROSS2"  → "Street & Cross1, Borough, NYC"
 *   "STREET between CROSS1 and CROSS2, STREET between..."  → uses first segment only
 */
function buildGeocodableAddress(location: string, borough: string): string {
  const boroughSuffix = borough === 'Staten Island' ? 'Staten Island, NY' : `${borough}, NY`;

  // Take only the first segment when there are multiple streets separated by commas
  const firstSegment = location.split(/,\s*(?=[A-Z])/)[0].trim();

  // Format 1: "PARK NAME: SPECIFIC AREA" — the colon separates park from sub-location
  if (firstSegment.includes(':')) {
    const parkName = firstSegment.split(':')[0].trim();
    return `${toTitleCase(parkName)}, ${boroughSuffix}`;
  }

  // Format 2: "STREET between CROSS1 and CROSS2"
  const betweenMatch = firstSegment.match(
    /^(.+?)\s+between\s+(.+?)\s+and\s+/i
  );
  if (betweenMatch) {
    const mainStreet = toTitleCase(betweenMatch[1].trim());
    const crossStreet = toTitleCase(betweenMatch[2].trim());
    return `${mainStreet} & ${crossStreet}, ${boroughSuffix}`;
  }

  // Fallback: use the whole location string + borough
  return `${toTitleCase(firstSegment)}, ${boroughSuffix}`;
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bNyc\b/g, 'NYC')
    .replace(/\bNy\b/g, 'NY');
}

/** Generate a short human-readable description from event metadata. */
function buildDescription(event: NycPermitEvent): string {
  const typeLabel: Record<string, string> = {
    'Farmers Market': 'Farmers market',
    'Plaza Partner Event': 'Free outdoor event',
    'Open Street Partner Event': 'Open streets community event',
    'Block Party': 'Neighborhood block party',
    'Parade': 'Public parade',
    'Street Festival': 'Street festival',
    'Single Block Festival': 'Block festival',
    'Athletic Race / Tour': 'Athletic event',
  };
  const label = typeLabel[event.event_type] ?? 'City-permitted public event';
  const borough = event.event_borough;
  return `${label} in ${borough}, permitted by the NYC ${event.event_agency}.`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { db } = await import('../src/db');
  const { events } = await import('../src/db/schema');
  const { eq, and } = await import('drizzle-orm');
  const { validateEventDates } = await import('../src/lib/utils/validateEventDates');
  const { normalizeEventTitle } = await import('../src/lib/utils/normalizeEventTitle');
  const { geocodeWithMapbox } = await import('../src/lib/utils/geocode');
  const { isWithinNYC } = await import('../src/lib/ingestion/location-validation');
  const { updateIngestionSourceStatus } = await import('../src/lib/db/ingestionService');
  const { buildInitialTicketUrls } = await import('../src/lib/utils/deduplicateAtIngestion');

  console.log('[NYCPermits] Starting sync:', new Date().toISOString());

  // ─── Fetch from Socrata ────────────────────────────────────────────────────
  const now = new Date();
  const horizon = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  const startFilter = now.toISOString().replace('Z', '').split('.')[0] + '.000';
  const endFilter = horizon.toISOString().replace('Z', '').split('.')[0] + '.000';

  const eventTypeFilter = PUBLIC_EVENT_TYPES.map((t) => `'${t}'`).join(',');
  const whereClause = `start_date_time>'${startFilter}' AND start_date_time<='${endFilter}' AND event_type IN(${eventTypeFilter})`;

  let allPermitEvents: NycPermitEvent[] = [];
  let offset = 0;

  while (true) {
    const url = `${SOCRATA_BASE}?$where=${encodeURIComponent(whereClause)}&$limit=${PAGE_SIZE}&$offset=${offset}&$order=start_date_time ASC`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Socrata API error: HTTP ${response.status}`);
    }

    const page = await response.json() as NycPermitEvent[];
    allPermitEvents = allPermitEvents.concat(page);

    console.log(`[NYCPermits] Fetched ${page.length} events (offset ${offset}, total so far: ${allPermitEvents.length})`);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`[NYCPermits] Total permit events: ${allPermitEvents.length}`);

  if (allPermitEvents.length === 0) {
    console.warn('[NYCPermits] No events returned from Socrata — check dataset or date range.');
    await updateIngestionSourceStatus('nyc_permits', 'error', 'No events returned');
    process.exit(1);
  }

  // ─── Ingest ────────────────────────────────────────────────────────────────
  const results = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const permit of allPermitEvents) {
    try {
      // ─── Dates ─────────────────────────────────────────────────────────────
      const startAt = new Date(permit.start_date_time);
      const endAt = permit.end_date_time ? new Date(permit.end_date_time) : null;

      const dateValidation = validateEventDates(startAt, endAt);
      if (!dateValidation.isValid) {
        results.skipped++;
        continue;
      }

      // ─── Title ─────────────────────────────────────────────────────────────
      if (!permit.event_name?.trim()) {
        results.skipped++;
        continue;
      }
      const normalizedTitle = normalizeEventTitle(permit.event_name) ?? permit.event_name;

      // ─── Location & geocoding ───────────────────────────────────────────────
      const geocodeQuery = buildGeocodableAddress(permit.event_location, permit.event_borough);
      const geocoded = await geocodeWithMapbox(permit.event_name, geocodeQuery);

      let lat: number | null = null;
      let lng: number | null = null;
      let resolvedAddress: string | null = geocodeQuery;

      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
        resolvedAddress = geocoded.placeName ?? geocodeQuery;
      }

      if (lat !== null && lng !== null && !isWithinNYC(lat, lng)) {
        results.skipped++;
        continue;
      }

      // ─── Category & metadata ────────────────────────────────────────────────
      const category = mapEventTypeToCategory(permit.event_type);
      const description = buildDescription(permit);

      // Recurring permits share the same event_id — append the date (YYYY-MM-DD)
      // so each occurrence gets a distinct externalId.
      const occurrenceDate = permit.start_date_time.slice(0, 10);
      const eventToInsert = {
        externalId: `${permit.event_id}_${occurrenceDate}`,
        sourceType: 'nyc_permits' as const,
        title: normalizedTitle,
        description,
        category,
        imageUrl: null as string | null,
        startAt,
        endAt: dateValidation.sanitizedEndAt,
        venueName: normalizedTitle,
        address: resolvedAddress,
        lat,
        lng,
        isFree: true,   // All city-permitted public events are free to attend
        priceMin: null as number | null,
        priceMax: null as number | null,
        currency: 'USD',
        ticketUrl: null as string | null,
        platform: 'NYC Permits',
        confidenceScore: 0.75,
        rawSource: { permit, geocodeQuery },
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
        ticketUrl: null,
        platform: eventToInsert.platform,
        priceMin: null,
        priceMax: null,
        isFree: true,
      };

      // ─── Intra-source dedup ─────────────────────────────────────────────────
      // Recurring permits (weekly greenmarkets, plaza events) reuse the same
      // event_id across all occurrences. Append the date so each occurrence
      // gets its own row in the events table.
      const existing = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.externalId, eventToInsert.externalId),
            eq(events.sourceType, 'nyc_permits')
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
        await db.insert(events).values({
          ...eventToInsert,
          ticketUrls: buildInitialTicketUrls(dedupCandidate),
        });
        results.inserted++;
      }
    } catch (err) {
      console.error(`[NYCPermits] Failed to process event ${permit.event_id}:`, err);
      results.errors++;
    }
  }

  await updateIngestionSourceStatus('nyc_permits', 'active');

  console.log(
    `[NYCPermits] Sync complete: inserted=${results.inserted}, updated=${results.updated}, ` +
      `skipped=${results.skipped}, errors=${results.errors}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[NYCPermits] Fatal error:', error);
    process.exit(1);
  });
