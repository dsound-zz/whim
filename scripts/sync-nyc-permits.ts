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

/**
 * Only recurring, place-named permit types may create venue-registry rows.
 * Ephemeral types (Block Party, Parade, Street Festival, plaza/open-street
 * programming) use the event title as their "venue" name, so resolving them
 * collapses unrelated locations into one canonical venue — 24 distinct block
 * parties were pinned to a single Bed-Stuy intersection this way. Those types
 * keep venueId null and rely on their own geocoded coordinates.
 */
const VENUE_CREATING_EVENT_TYPES = new Set(['Farmers Market']);

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
    const mainStreet = addOrdinalSuffixes(toTitleCase(betweenMatch[1].trim()));
    const crossStreet = addOrdinalSuffixes(toTitleCase(betweenMatch[2].trim()));
    return `${mainStreet} & ${crossStreet}, ${boroughSuffix}`;
  }

  // Fallback: use the whole location string + borough
  return `${addOrdinalSuffixes(toTitleCase(firstSegment))}, ${boroughSuffix}`;
}

/**
 * NYC permit data writes numbered streets without an ordinal suffix
 * ("122 PLACE", "4 AVENUE"). Mapbox fails to resolve those and falls back to a
 * low-relevance partial match, so restore the suffix before geocoding.
 * Measured: "122 Place & Sutter Avenue" scores 0.72 and resolves to the wrong
 * borough; "122nd Place & Sutter Avenue" scores 1.0 and resolves exactly.
 * Only applies to a number directly preceding a street-type word, so house
 * numbers ("100 Gold Street") are left alone.
 */
function addOrdinalSuffixes(str: string): string {
  return str.replace(
    /\b(\d+)\s+(Street|Avenue|Place|Road|Drive|Court|Terrace|Lane)\b/gi,
    (_match, num: string, streetType: string) => {
      const n = parseInt(num, 10);
      const lastTwo = n % 100;
      const lastOne = n % 10;
      let suffix = 'th';
      if (lastTwo < 11 || lastTwo > 13) {
        if (lastOne === 1) suffix = 'st';
        else if (lastOne === 2) suffix = 'nd';
        else if (lastOne === 3) suffix = 'rd';
      }
      return `${n}${suffix} ${streetType}`;
    }
  );
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
  const { eq, and, gt, lte, inArray } = await import('drizzle-orm');
  const { validateEventDates } = await import('../src/lib/utils/validateEventDates');
  const { normalizeEventTitle } = await import('../src/lib/utils/normalizeEventTitle');
  const { geocodeWithMapbox } = await import('../src/lib/utils/geocode');
  const { isValidLocation } = await import('../src/lib/ingestion/location-validation');
  const { updateIngestionSourceStatus } = await import('../src/lib/db/ingestionService');
  const { resolveVenueSafely } = await import('../src/lib/db/venueService');
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
  const results = { inserted: 0, updated: 0, skipped: 0, errors: 0, expired: 0 };

  // externalIds seen in this run, used below to retire permits the city has
  // withdrawn. Without this, a cancelled permit stays 'active' forever because
  // nothing ever revisits it.
  const seenExternalIds = new Set<string>();

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

      // `skipVenueDbLookup` is essential here: the geocoder's first step is a
      // name lookup against `venues`, and this source has no venue name to give
      // it — only the event title. Passing a title like "Block Party" matched a
      // registry row of the same name and returned that row's coordinates,
      // silently discarding the query and pinning 24 block parties across three
      // boroughs to one Bed-Stuy intersection.
      const geocoded = await geocodeWithMapbox(permit.event_name, geocodeQuery, {
        skipVenueDbLookup: true,
        minRelevance: 0.8,
      });

      let lat: number | null = null;
      let lng: number | null = null;
      let resolvedAddress: string | null = geocodeQuery;

      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
        resolvedAddress = geocoded.placeName ?? geocodeQuery;
      }

      // isValidLocation (not just isWithinNYC) also rejects the generic borough
      // centroids Mapbox returns when it can't resolve an intersection. Keep the
      // event with null coordinates rather than plotting it on a wrong point.
      if (lat !== null && lng !== null && !isValidLocation(lat, lng)) {
        console.warn(
          `[NYCPermits] Discarding generic/invalid coords for "${permit.event_name}" (${geocodeQuery})`
        );
        lat = null;
        lng = null;
        resolvedAddress = geocodeQuery;
      }

      // ─── Category & metadata ────────────────────────────────────────────────
      const category = mapEventTypeToCategory(permit.event_type);
      const description = buildDescription(permit);

      // Resolve to a canonical venue only for market-type permits, where the
      // permit name is a stable place name and weekly occurrences should share
      // one venue + coords. Ephemeral types stay registry-free (see
      // VENUE_CREATING_EVENT_TYPES).
      const resolvedVenue = VENUE_CREATING_EVENT_TYPES.has(permit.event_type)
        ? await resolveVenueSafely({
            name: normalizedTitle,
            address: resolvedAddress,
            lat,
            lng,
            sourceType: 'nyc_permits',
          })
        : null;

      // For ephemeral permits, label the "venue" with the street location
      // rather than repeating the event title ("Block Party at Block Party").
      const displayVenueName = VENUE_CREATING_EVENT_TYPES.has(permit.event_type)
        ? normalizedTitle
        : geocodeQuery.replace(/, NY$/, '');

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
        venueId: resolvedVenue?.venueId ?? null,
        venueName: displayVenueName,
        address: resolvedAddress,
        lat: resolvedVenue?.lat ?? lat,
        lng: resolvedVenue?.lng ?? lng,
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

      seenExternalIds.add(eventToInsert.externalId);

      const dedupCandidate = {
        externalId: eventToInsert.externalId,
        sourceType: eventToInsert.sourceType,
        title: eventToInsert.title,
        venueId: eventToInsert.venueId,
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
            // Without this the row keeps its original timestamp, so the
            // stale-event audit can never tell a refreshed permit from an
            // abandoned one.
            updatedAt: new Date(),
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

  // ─── Retire withdrawn permits ──────────────────────────────────────────────
  // Every permit starting inside the fetch window was returned above, so an
  // active future event we did not just touch no longer exists upstream — the
  // city cancelled or rescheduled it. Scoped to the window so events beyond the
  // horizon (never fetched this run) are left alone.
  if (seenExternalIds.size > 0) {
    const windowEnd = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);

    const staleRows = await db
      .select({ id: events.id, externalId: events.externalId })
      .from(events)
      .where(
        and(
          eq(events.sourceType, 'nyc_permits'),
          eq(events.status, 'active'),
          gt(events.startAt, now),
          lte(events.startAt, windowEnd)
        )
      );

    const staleIds = staleRows
      .filter((row) => !row.externalId || !seenExternalIds.has(row.externalId))
      .map((row) => row.id);

    if (staleIds.length > 0) {
      await db
        .update(events)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(inArray(events.id, staleIds));
      results.expired = staleIds.length;
    }
  }

  await updateIngestionSourceStatus('nyc_permits', 'active');

  console.log(
    `[NYCPermits] Sync complete: inserted=${results.inserted}, updated=${results.updated}, ` +
      `skipped=${results.skipped}, expired=${results.expired}, errors=${results.errors}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[NYCPermits] Fatal error:', error);
    process.exit(1);
  });
