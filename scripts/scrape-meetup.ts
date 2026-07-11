/**
 * Meetup NYC event scraper.
 *
 * Fetches in-person events from meetup.com/find/events/ using two strategies:
 *  1. Parses the server-side-rendered __NEXT_DATA__ Apollo state on initial page load.
 *  2. Playwright scroll + JSON response interception to capture additional events
 *     loaded by the page's Apollo client as the user scrolls.
 *
 * No API key required — public events are accessible without auth.
 * Only PHYSICAL (in-person) events within NYC bounding box are ingested.
 */

import * as dotenv from 'dotenv';
dotenv.config();

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeetupVenue {
  __typename: 'Venue';
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  lat?: number;
  lng?: number;
}

interface MeetupPhoto {
  __typename: 'PhotoInfo';
  baseUrl: string;
  highResUrl: string;
  id: string;
}

interface MeetupGroup {
  __typename: 'Group';
  id: string;
  name: string;
  urlname: string;
  timezone?: string;
}

interface MeetupFeeSettings {
  amount?: number;
  currency?: string;
}

interface MeetupEvent {
  __typename: 'Event';
  id: string;
  title: string;
  dateTime: string;       // ISO-8601 with offset, e.g. "2026-06-23T18:30:00-04:00"
  description?: string;
  eventType: 'PHYSICAL' | 'ONLINE' | 'HYBRID';
  eventUrl: string;
  feeSettings?: MeetupFeeSettings | null;
  featuredEventPhoto?: { __ref: string } | null;
  displayPhoto?: { __ref: string } | null;
  group?: { __ref: string } | { __typename: string; urlname: string };
  venue?: MeetupVenue | null;
}

type MeetupApolloObject =
  | MeetupEvent
  | MeetupPhoto
  | MeetupGroup
  | { __typename: string; [key: string]: unknown };

type MeetupApolloState = Record<string, MeetupApolloObject>;

// ─── Apollo state extraction ──────────────────────────────────────────────────

function extractFullEventsFromApolloState(apolloState: MeetupApolloState): MeetupEvent[] {
  return Object.values(apolloState).filter(
    (obj): obj is MeetupEvent =>
      obj.__typename === 'Event' &&
      'title' in obj &&
      'dateTime' in obj &&
      'eventType' in obj &&
      (obj as MeetupEvent).eventType === 'PHYSICAL'
  );
}

function resolvePhotoUrl(
  event: MeetupEvent,
  apolloState: MeetupApolloState
): string | null {
  const photoRef = event.featuredEventPhoto ?? event.displayPhoto;
  if (!photoRef || !('__ref' in photoRef)) return null;
  const photo = apolloState[photoRef.__ref];
  if (!photo || photo.__typename !== 'PhotoInfo') return null;
  return (photo as MeetupPhoto).highResUrl ?? null;
}

// Extract events from any JSON blob Meetup might return via XHR
function extractEventsFromXhrJson(json: unknown): MeetupEvent[] {
  if (!json || typeof json !== 'object') return [];

  const results: MeetupEvent[] = [];

  // Pattern 1: GraphQL response with rankedEvents
  const data = (json as Record<string, unknown>).data;
  if (data && typeof data === 'object') {
    const rankedEvents = (data as Record<string, unknown>).rankedEvents;
    if (rankedEvents && typeof rankedEvents === 'object') {
      const edges = (rankedEvents as Record<string, unknown>).edges;
      if (Array.isArray(edges)) {
        for (const edge of edges) {
          const node = (edge as Record<string, unknown>).node;
          if (node && typeof node === 'object' && (node as MeetupEvent).__typename === 'Event') {
            const ev = node as MeetupEvent;
            if (ev.eventType === 'PHYSICAL' && ev.id && ev.title) {
              results.push(ev);
            }
          }
        }
      }
    }
  }

  // Pattern 2: Apollo state update (flat keyed object with Event: entries)
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (key.startsWith('Event:') && value && typeof value === 'object') {
      const ev = value as MeetupEvent;
      if (ev.__typename === 'Event' && ev.eventType === 'PHYSICAL' && ev.id && ev.title) {
        results.push(ev);
      }
    }
  }

  return results;
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

  console.log('[Meetup] Starting NYC event scrape:', new Date().toISOString());

  // Multiple location queries to maximize SSR coverage without auth.
  // Each URL yields a distinct SSR batch; we dedup by event ID.
  const MEETUP_URLS = [
    'https://www.meetup.com/find/events/?location=New+York--NY&source=EVENTS&distance=TEN_MILES&eventType=inPerson',
    'https://www.meetup.com/find/events/?location=Manhattan--NY&source=EVENTS&distance=FIVE_MILES&eventType=inPerson',
    'https://www.meetup.com/find/events/?location=Brooklyn--NY&source=EVENTS&distance=FIVE_MILES&eventType=inPerson',
    'https://www.meetup.com/find/events/?location=Queens--NY&source=EVENTS&distance=FIVE_MILES&eventType=inPerson',
    'https://www.meetup.com/find/events/?location=Bronx--NY&source=EVENTS&distance=FIVE_MILES&eventType=inPerson',
    'https://www.meetup.com/find/events/?location=New+York--NY&source=EVENTS&distance=TWENTY_FIVE_MILES&eventType=inPerson',
  ];
  const MAX_SCROLLS = 3;
  const SCROLL_DELAY_MS = 2000;

  const { chromium } = await import('playwright-extra');
  const { default: stealth } = await import('puppeteer-extra-plugin-stealth');
  chromium.use(stealth());

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const results = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  // All events keyed by Meetup event ID to deduplicate across SSR + XHR
  const capturedEvents = new Map<string, MeetupEvent>();
  // Apollo state from SSR, needed to resolve photo refs
  let ssrApolloState: MeetupApolloState = {};

  // ─── Response interception ─────────────────────────────────────────────────
  // Capture JSON responses Meetup's Apollo client fetches when loading more events
  page.on('response', async (response) => {
    if (response.status() !== 200) return;
    const contentType = response.headers()['content-type'] ?? '';
    if (!contentType.includes('application/json')) return;

    const url = response.url();
    if (!url.includes('meetup.com')) return;

    try {
      const json = await response.json() as unknown;
      const xhrEvents = extractEventsFromXhrJson(json);
      for (const ev of xhrEvents) {
        if (!capturedEvents.has(ev.id)) {
          capturedEvents.set(ev.id, ev);
        }
      }
      if (xhrEvents.length > 0) {
        console.log(`[Meetup] Intercepted ${xhrEvents.length} events from ${url.split('?')[0]}`);
      }
    } catch {
      // Not parseable JSON or not relevant
    }
  });

  try {
    for (let urlIndex = 0; urlIndex < MEETUP_URLS.length; urlIndex++) {
      const url = MEETUP_URLS[urlIndex];
      console.log(`[Meetup] [${urlIndex + 1}/${MEETUP_URLS.length}] Fetching: ${url}`);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (navError) {
        console.warn(`[Meetup] Navigation failed for ${url}:`, navError);
        continue;
      }

      // ─── Parse SSR __NEXT_DATA__ ──────────────────────────────────────────
      const nextDataText = await page.evaluate(() => {
        const el = document.getElementById('__NEXT_DATA__');
        return el ? el.textContent : null;
      });

      if (nextDataText) {
        try {
          const nextData = JSON.parse(nextDataText) as {
            props?: { pageProps?: { __APOLLO_STATE__?: MeetupApolloState } };
          };
          const apolloState = nextData?.props?.pageProps?.['__APOLLO_STATE__'] ?? {};

          // Merge into ssrApolloState so photo refs remain resolvable
          Object.assign(ssrApolloState, apolloState);

          const pageEvents = extractFullEventsFromApolloState(apolloState);
          let newOnThisPage = 0;
          for (const ev of pageEvents) {
            if (!capturedEvents.has(ev.id)) {
              capturedEvents.set(ev.id, ev);
              newOnThisPage++;
            }
          }
          console.log(
            `[Meetup] SSR: ${pageEvents.length} events (${newOnThisPage} new, ${capturedEvents.size} total)`
          );
        } catch (parseError) {
          console.warn(`[Meetup] Failed to parse __NEXT_DATA__ for ${url}:`, parseError);
        }
      }

      // ─── Scroll to trigger more event loads ────────────────────────────────
      let previousScrollCount = capturedEvents.size;
      for (let scroll = 0; scroll < MAX_SCROLLS; scroll++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(SCROLL_DELAY_MS);

        const currentCount = capturedEvents.size;
        if (currentCount > previousScrollCount) {
          console.log(`[Meetup] Scroll ${scroll + 1}: ${currentCount - previousScrollCount} new events`);
        }
        if (scroll > 0 && currentCount === previousScrollCount) break;
        previousScrollCount = currentCount;
      }

      // Polite delay between pages
      if (urlIndex < MEETUP_URLS.length - 1) {
        await page.waitForTimeout(1500);
      }
    }

    console.log(`[Meetup] Total events captured across all pages: ${capturedEvents.size}`);
  } finally {
    await browser.close();
  }

  if (capturedEvents.size === 0) {
    console.warn('[Meetup] No events captured — check if site structure changed.');
    await updateIngestionSourceStatus('meetup_scrape', 'error', 'No events captured');
    process.exit(1);
  }

  // ─── Ingest captured events ────────────────────────────────────────────────
  let processedCount = 0;

  for (const event of capturedEvents.values()) {
    processedCount++;

    try {
      // ─── Date / time ───────────────────────────────────────────────────────
      const startAt = new Date(event.dateTime);
      const dateValidation = validateEventDates(startAt, null);
      if (!dateValidation.isValid) {
        results.skipped++;
        continue;
      }

      // ─── Title ─────────────────────────────────────────────────────────────
      const normalizedTitle = normalizeEventTitle(event.title) ?? event.title;

      // ─── Description ───────────────────────────────────────────────────────
      const description = event.description ?? null;

      // ─── Image ─────────────────────────────────────────────────────────────
      // Try resolving from SSR Apollo state; XHR-captured events may not have refs
      const imageUrl = resolvePhotoUrl(event, ssrApolloState);

      // ─── Venue & geocoding ─────────────────────────────────────────────────
      const venueData = event.venue;
      if (!venueData || !venueData.name) {
        console.warn(`[Meetup] Skipping "${normalizedTitle}" — no venue data`);
        results.skipped++;
        continue;
      }

      const venueName = venueData.name;
      const rawAddress = [
        venueData.address,
        venueData.city,
        venueData.state,
        venueData.country === 'US' ? 'USA' : venueData.country,
      ]
        .filter(Boolean)
        .join(', ');

      let lat: number | null = venueData.lat ?? null;
      let lng: number | null = venueData.lng ?? null;
      let resolvedAddress: string | null = rawAddress;

      if (lat === null || lng === null) {
        const geocodeQuery = `${venueName}, ${rawAddress}`;
        const geocoded = await geocodeWithMapbox(venueName, geocodeQuery);
        if (geocoded) {
          lat = geocoded.lat;
          lng = geocoded.lng;
          resolvedAddress = geocoded.placeName ?? rawAddress;
        }
      }

      if (lat !== null && lng !== null && !isWithinNYC(lat, lng)) {
        console.warn(
          `[Meetup] Skipping "${normalizedTitle}" — venue outside NYC bbox (${lat}, ${lng})`
        );
        results.skipped++;
        continue;
      }

      // ─── Price ─────────────────────────────────────────────────────────────
      // feeSettings === null means free RSVP; otherwise it carries the fee amount
      const isFree = event.feeSettings === null || event.feeSettings === undefined;
      const priceMin = event.feeSettings?.amount ?? null;
      const priceMax = event.feeSettings?.amount ?? null;

      // ─── Category ──────────────────────────────────────────────────────────
      const category = await classifyEventCategory({
        title: normalizedTitle,
        description,
        skipLlmFallback: false,
        defaultCategory: 'community',
      });

      const ticketUrl = event.eventUrl;

      const resolvedVenue = await resolveVenueSafely({
        name: venueName,
        address: resolvedAddress,
        lat,
        lng,
        sourceType: 'meetup_scrape',
      });

      const eventToInsert = {
        externalId: event.id,
        sourceType: 'meetup_scrape' as const,
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
        isFree,
        priceMin,
        priceMax,
        currency: 'USD',
        ticketUrl,
        platform: 'Meetup',
        confidenceScore: 0.8,
        rawSource: { event, resolvedAddress },
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
        priceMin: eventToInsert.priceMin,
        priceMax: eventToInsert.priceMax,
        isFree: eventToInsert.isFree,
      };

      // ─── Intra-source dedup (same Meetup event ID already in DB) ───────────
      const existing = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.externalId, event.id),
            eq(events.sourceType, 'meetup_scrape')
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
        // ─── Cross-platform dedup (same event already from another source) ──
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
      console.error(`[Meetup] Failed to process event ${event.id}:`, eventError);
      results.errors++;
    }
  }

  await updateIngestionSourceStatus('meetup_scrape', 'active');

  console.log(
    `[Meetup] Scrape complete: processed=${processedCount}, ` +
      `inserted=${results.inserted}, updated=${results.updated}, ` +
      `skipped=${results.skipped}, errors=${results.errors}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[Meetup Scraper] Fatal error:', error);
    process.exit(1);
  });
