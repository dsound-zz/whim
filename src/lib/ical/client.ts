/**
 * iCal feed client.
 *
 * Fetches a remote .ics feed, parses it with node-ical, and normalizes
 * each VEVENT into the shape the Whim ingestion pipeline expects.
 *
 * Recurring events (RRULE) are expanded into individual occurrences using
 * node-ical's built-in expandRecurringEvent(), covering a configurable
 * rolling window (default: 60 days).
 *
 * Each occurrence gets a stable externalId derived from:
 *   `{UID}` for one-off events
 *   `{UID}_{startAt.toISOString()}` for each recurrence instance
 *
 * This guarantees idempotency across re-fetches while keeping each
 * occurrence as a distinct row (matching the consumer API's expectation
 * of individual date-based events).
 */

import * as ical from 'node-ical';
import type { VEvent, ParameterValue } from 'node-ical';
import { normalizeEventTitle } from '@/lib/utils/normalizeEventTitle';
import { classifyEventCategory } from '@/lib/utils/categorizeEvent';
import { geocodeWithMapbox } from '@/lib/utils/geocode';
import { validateEventDates } from '@/lib/utils/validateEventDates';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ICalFeedConfig {
  /** The full URL of the .ics feed to fetch */
  feedUrl: string;
  /**
   * The canonical venue name to use when the LOCATION field is absent or
   * too generic (e.g. "New York, NY"). Falls back to parsing LOCATION.
   */
  defaultVenueName: string;
  /**
   * How many days forward from today to expand recurring event occurrences.
   * Defaults to RECURRENCE_EXPANSION_DAYS (60 days).
   */
  expansionDays?: number;
}

export interface NormalizedICalEvent {
  /** Stable external ID: UID for one-off, UID_ISO for each recurrence instance */
  externalId: string;
  title: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  startAt: Date;
  endAt: Date | null;
  venueName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  isFree: boolean;
  priceMin: number | null;
  priceMax: number | null;
  currency: 'USD';
  ticketUrl: string | null;
  platform: string;
  confidenceScore: number;
  /** The RFC 5545 RRULE string, stored for reference. Null for one-off events. */
  recurrenceRule: string | null;
  /** Raw VEVENT uid for traceability */
  uid: string;
}

export interface ICalFetchResult {
  events: NormalizedICalEvent[];
  feedTitle: string | null;
  errors: Array<{ uid: string; reason: string }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RECURRENCE_EXPANSION_DAYS = 60;
const CONFIDENCE_SCORE = 0.5;

/**
 * Bare borough names some feeds use as LOCATION when the actual venue isn't
 * specified there. Too generic to resolve as a venue on their own — see
 * isBareBoroughName / extractVenueNameFromTitle below.
 */
const NYC_BOROUGHS = new Set(['manhattan', 'brooklyn', 'queens', 'bronx', 'staten island']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the plain string value from a node-ical ParameterValue.
 * node-ical sometimes wraps values as { val: string; params: {...} }.
 */
function extractParamValue(value: ParameterValue | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object' && 'val' in value && typeof value.val === 'string') {
    return value.val.trim() || null;
  }
  return null;
}

/**
 * Attempts to extract an image URL from an iCal VEVENT.
 *
 * Checks (in priority order):
 * 1. RFC 7986 IMAGE property
 * 2. ATTACH properties with image FMTTYPE or image file extensions
 * 3. X-WR-IMAGE / X-IMAGE custom properties (used by some calendar services)
 * 4. <img> tags embedded in HTML descriptions (last resort)
 */
function extractImageUrl(event: VEvent): string | null {
  const rawEvent = event as Record<string, unknown>;

  // 1. RFC 7986 IMAGE property
  if (typeof rawEvent['image'] === 'string' && rawEvent['image'].startsWith('http')) {
    return rawEvent['image'];
  }

  // 2. ATTACH properties — the standard way calendars embed images
  const attach = rawEvent['attach'];
  if (attach) {
    const attachments = Array.isArray(attach) ? attach : [attach];
    for (const attachment of attachments) {
      const attachUrl = typeof attachment === 'string'
        ? attachment
        : (attachment as Record<string, unknown>)?.val as string | undefined;

      if (typeof attachUrl === 'string' && attachUrl.startsWith('http')) {
        // Check FMTTYPE parameter or file extension
        const fmtType = ((attachment as Record<string, unknown>)?.params as Record<string, unknown> | undefined)?.FMTTYPE as string | undefined;
        const isImageFmt = fmtType?.startsWith('image/');
        const isImageExt = /\.(jpe?g|png|gif|webp|svg|avif)(\?|$)/i.test(attachUrl);

        if (isImageFmt || isImageExt) {
          return attachUrl;
        }
      }
    }
  }

  // 3. X-* custom image properties
  for (const customKey of ['X-WR-IMAGE', 'X-IMAGE', 'x-wr-image', 'x-image']) {
    const customValue = rawEvent[customKey];
    if (typeof customValue === 'string' && customValue.startsWith('http')) {
      return customValue;
    }
  }

  // 4. <img> tags in HTML description (last resort)
  const description = typeof rawEvent['description'] === 'string' ? rawEvent['description'] : null;
  if (description) {
    const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]?.startsWith('http')) {
      return imgMatch[1];
    }
  }

  return null;
}

/**
 * Resolves a venueName and address from an iCal LOCATION field.
 * The LOCATION field is free-form — it may be just a venue name,
 * a full address, or a venue name + address separated by a comma.
 *
 * We return both the full LOCATION string (as address) and attempt
 * to extract a shorter venue name from the first segment.
 */
function parseLocation(
  locationValue: ParameterValue | undefined,
  defaultVenueName: string
): { venueName: string; rawAddress: string | null } {
  const locationStr = extractParamValue(locationValue);
  if (!locationStr) {
    return { venueName: defaultVenueName, rawAddress: null };
  }

  // Some calendars put "Venue Name, 123 Street, City, State" in LOCATION.
  // Use the first comma-segment as the venue name if it looks like a name
  // (no digits, reasonably short) and treat the full string as the address.
  const firstSegment = locationStr.split(',')[0].trim();
  const isLikelyVenueName = firstSegment.length > 0 &&
    firstSegment.length < 60 &&
    !/^\d/.test(firstSegment);

  return {
    venueName: isLikelyVenueName ? firstSegment : defaultVenueName,
    rawAddress: locationStr,
  };
}

function isBareBoroughName(venueName: string): boolean {
  return NYC_BOROUGHS.has(venueName.trim().toLowerCase());
}

/**
 * Recovers a specific venue name from the event title when LOCATION only
 * gives a borough. City Parks Foundation's "It's My Park" volunteer series
 * runs at dozens of distinct parks across the city but never puts the park
 * name in LOCATION — every such event resolved to the same borough-level
 * venue (e.g. one venue literally named "Brooklyn") until this was added,
 * silently merging McKinley Park, Marine Park, McCarren Park, and others
 * into a single wrong-location venue.
 */
function extractVenueNameFromTitle(title: string): string | null {
  const match = title.match(/^It'?s My Park (?:at|@)\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetches and parses an iCal feed URL, normalizing all VEVENTs into
 * the Whim ingestion format. Geocodes each event's location using
 * the unified Mapbox geocoder.
 *
 * Recurring events are expanded into individual instances covering
 * today through `expansionDays` days from now.
 */
export async function fetchAndParseICalFeed(
  config: ICalFeedConfig
): Promise<ICalFetchResult> {
  const { feedUrl, defaultVenueName, expansionDays = RECURRENCE_EXPANSION_DAYS } = config;

  const expandFrom = new Date();
  const expandTo = new Date();
  expandTo.setDate(expandTo.getDate() + expansionDays);

  console.log(`[iCal Client] Fetching feed: ${feedUrl}`);

  // Fetch the raw .ics content and hand it to node-ical's sync parser.
  // We use fetch() directly (rather than node-ical's fromURL) so we can
  // control headers and handle non-200 responses cleanly.
  const response = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'WhimBot/1.0 (+https://whim.app; events-aggregator)',
      'Accept': 'text/calendar, application/ics',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching iCal feed: ${feedUrl}`);
  }

  // Validate the response is actually iCal content.
  // Some venues return HTML 200s for missing .ics paths (e.g. SPA frameworks).
  const contentType = response.headers.get('content-type') ?? '';
  const isICalContentType =
    contentType.includes('text/calendar') ||
    contentType.includes('application/ics') ||
    contentType.includes('application/octet-stream'); // Some servers use this for .ics

  const rawIcs = await response.text();

  // Final guard: even if content-type is wrong, check if it looks like iCal
  const isICalBody = rawIcs.trimStart().startsWith('BEGIN:VCALENDAR');

  if (!isICalContentType && !isICalBody) {
    throw new Error(
      `Feed URL did not return iCal content (content-type: ${contentType}). ` +
        `Response starts with: "${rawIcs.slice(0, 100).replace(/\n/g, '\\n')}"`
    );
  }
  const parsedCalendar = ical.sync.parseICS(rawIcs);

  // Extract the calendar title from VCALENDAR metadata (X-WR-CALNAME)
  const feedTitle: string | null =
    (parsedCalendar.vcalendar?.['WR-CALNAME'] as string | undefined) ?? null;

  const normalizedEvents: NormalizedICalEvent[] = [];
  const errors: Array<{ uid: string; reason: string }> = [];

  // Filter to only VEVENT components
  const vevents = Object.values(parsedCalendar).filter(
    (component): component is VEvent =>
      component != null && (component as { type?: string }).type === 'VEVENT'
  );

  console.log(`[iCal Client] Found ${vevents.length} VEVENTs in feed.`);

  for (const vevent of vevents) {
    try {
      // ─── Determine occurrences to process ─────────────────────────────────
      // For recurring events, expand into individual instances.
      // For one-off events, treat as a single-element list.

      type OccurrenceEntry = { startAt: Date; endAt: Date | null; isRecurring: boolean };
      let occurrences: OccurrenceEntry[];

      if (vevent.rrule) {
        const instances = ical.expandRecurringEvent(vevent, {
          from: expandFrom,
          to: expandTo,
          includeOverrides: true,
          excludeExdates: true,
        });
        occurrences = instances.map((instance) => ({
          startAt: instance.start,
          endAt: instance.end ?? null,
          isRecurring: true,
        }));
      } else {
        // One-off: use the raw start/end from the VEVENT
        occurrences = [
          {
            startAt: vevent.start,
            endAt: vevent.end ?? null,
            isRecurring: false,
          },
        ];
      }

      if (occurrences.length === 0) continue;

      // ─── Fields shared across all occurrences of this VEVENT ──────────────

      const rawTitle = extractParamValue(vevent.summary) ?? 'Untitled Event';
      const title = normalizeEventTitle(rawTitle) ?? rawTitle;

      const description = extractParamValue(vevent.description);
      const ticketUrl = vevent.url ?? null;
      const imageUrl = extractImageUrl(vevent);

      const category = await classifyEventCategory({
        title,
        description,
        skipLlmFallback: false,
      });

      // ─── Location / geocoding ──────────────────────────────────────────────
      // Geocode once per VEVENT (the location doesn't change between occurrences).

      const { venueName: locationVenueName, rawAddress } = parseLocation(
        vevent.location,
        defaultVenueName
      );

      // When LOCATION is only a borough, try to recover the real venue from
      // the title (see extractVenueNameFromTitle) before falling back to the
      // borough itself as the venue name.
      const specificVenueName = isBareBoroughName(locationVenueName)
        ? extractVenueNameFromTitle(title)
        : null;
      const venueName = specificVenueName ?? locationVenueName;
      // Geocode the recovered venue against the borough the feed gave us,
      // not against rawAddress (which is just the borough name here too).
      const geocodeAddress = specificVenueName ? locationVenueName : rawAddress;

      let lat: number | null = null;
      let lng: number | null = null;
      let address: string | null = geocodeAddress;

      const geocodeQuery = geocodeAddress
        ? `${venueName}, ${geocodeAddress}`
        : `${venueName}, New York City, NY, USA`;

      // A title-recovered venue name has no street address to anchor the
      // query, so Mapbox is more likely to return a low-confidence partial
      // match (e.g. "McKinley Park, Brooklyn" resolving to "Park Ave,
      // Brooklyn" — a street with no connection to the park) than to fail
      // outright. minRelevance rejects those rather than storing them; a
      // rejected geocode falls through to resolveVenue's own fallback
      // geocode, which applies the same threshold.
      const geocoded = await geocodeWithMapbox(venueName, geocodeQuery, {
        minRelevance: specificVenueName ? 0.8 : undefined,
      });
      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
        address = geocoded.placeName;
      }

      // Extract RRULE string for storage
      const recurrenceRule: string | null = vevent.rrule
        ? vevent.rrule.toString()
        : null;

      // ─── Emit one NormalizedICalEvent per occurrence ───────────────────────

      for (const occurrence of occurrences) {
        const { isValid, sanitizedEndAt, rejectionReason } = validateEventDates(
          occurrence.startAt,
          occurrence.endAt
        );

        if (!isValid) {
          // Don't log spam for recurring events that extend into the past — just skip
          if (!occurrence.isRecurring) {
            console.warn(
              `[iCal Client] Skipping event UID=${vevent.uid}: ${rejectionReason}`
            );
          }
          continue;
        }

        // Stable externalId: UID for one-off, UID + ISO timestamp for recurring
        const externalId = occurrence.isRecurring
          ? `${vevent.uid}_${occurrence.startAt.toISOString()}`
          : vevent.uid;

        normalizedEvents.push({
          externalId,
          title,
          description,
          category,
          imageUrl,
          startAt: occurrence.startAt,
          endAt: sanitizedEndAt,
          venueName,
          address,
          lat,
          lng,
          isFree: false, // iCal feeds rarely include pricing; default to unknown (not free)
          priceMin: null,
          priceMax: null,
          currency: 'USD',
          ticketUrl,
          platform: feedTitle ?? defaultVenueName,
          confidenceScore: CONFIDENCE_SCORE,
          recurrenceRule,
          uid: vevent.uid,
        });
      }
    } catch (eventError) {
      console.error(`[iCal Client] Failed to process UID=${vevent.uid}:`, eventError);
      errors.push({
        uid: vevent.uid,
        reason: String(eventError),
      });
    }
  }

  console.log(
    `[iCal Client] Normalized ${normalizedEvents.length} event occurrences from ${feedUrl}. Errors: ${errors.length}`
  );

  return { events: normalizedEvents, feedTitle, errors };
}
