/**
 * Cross-platform hard deduplication service.
 *
 * When a new event is ingested, this module checks whether a canonical event
 * already exists in the database that represents the same real-world event.
 *
 * Matching criteria (all three must pass):
 * 1. startAt within ±30 minutes of the canonical event
 * 2. Venue is similar (name substring match OR coordinates within 160m)
 * 3. Title has meaningful token overlap (Jaccard similarity ≥ 0.4)
 *
 * Source trust hierarchy (higher = more trusted; canonical row uses highest-trust data):
 *   ticketmaster_api (1.0) > eventbrite_api (0.9) > nyc_parks_api (0.85) >
 *   songkick_scrape (0.75) > dice_scrape (0.7) > ra_scrape (0.6) > scrape (0.5) >
 *   ical (0.5) > email (0.4) > submission (0.4)
 *
 * On match:
 * - The incoming event's ticket source is appended to the canonical's ticketUrls array.
 * - If the incoming event has higher trust, the canonical's core fields are updated.
 * - The incoming event is NOT inserted as a new row — the canonical row is returned.
 *
 * On no match:
 * - The event is new. ticketUrls is initialized from the event's own ticketUrl.
 * - Returns null to signal the caller should proceed with a normal insert.
 */

import { db } from '@/db';
import { events } from '@/db/schema';
import { and, gte, lte, eq, ne } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TicketUrlEntry {
  platform: string;
  url: string | null;
  priceMin: number | null;
  priceMax: number | null;
  isFree: boolean | null;
}

export interface MergedSourceEntry {
  externalId: string;
  sourceType: string;
  platform: string;
}

export interface IncomingEventForDedup {
  externalId: string;
  sourceType: string;
  title: string;
  venueName: string | null;
  lat: number | null;
  lng: number | null;
  startAt: Date;
  ticketUrl: string | null;
  platform: string | null;
  priceMin: number | null;
  priceMax: number | null;
  isFree: boolean | null;
}

// ─── Source trust hierarchy ───────────────────────────────────────────────────

const SOURCE_TRUST_SCORES: Record<string, number> = {
  ticketmaster_api: 1.0,
  eventbrite_api: 0.9,
  nyc_parks_api: 0.85,
  songkick_scrape: 0.75,
  dice_scrape: 0.7,
  ra_scrape: 0.6,
  scrape: 0.5,
  ical: 0.5,
  rss: 0.45,
  email: 0.4,
  submission: 0.4,
  dice_api: 0.7,
  seatgeek_api: 0.9,
};

function getTrustScore(sourceType: string): number {
  return SOURCE_TRUST_SCORES[sourceType] ?? 0.5;
}

// ─── Matching helpers ─────────────────────────────────────────────────────────

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const VENUE_PROXIMITY_MILES = 0.1; // ~160 meters
const MIN_TITLE_SIMILARITY = 0.4;  // Jaccard similarity threshold

function areStartTimesClose(timeA: Date, timeB: Date): boolean {
  return Math.abs(timeA.getTime() - timeB.getTime()) <= THIRTY_MINUTES_MS;
}

function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(str: string): Set<string> {
  return new Set(
    normalizeForComparison(str)
      .split(' ')
      .filter((token) => token.length > 2) // skip short stop words
  );
}

/**
 * Jaccard similarity between two token sets: |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter((token) => setB.has(token)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function areTitlesSimilar(titleA: string, titleB: string): boolean {
  const tokensA = tokenize(titleA);
  const tokensB = tokenize(titleB);
  return jaccardSimilarity(tokensA, tokensB) >= MIN_TITLE_SIMILARITY;
}

function areVenuesSimilar(
  nameA: string | null,
  latA: number | null,
  lngA: number | null,
  nameB: string | null,
  latB: number | null,
  lngB: number | null
): boolean {
  // Coordinate proximity check
  if (latA != null && lngA != null && latB != null && lngB != null) {
    if (getDistanceMiles(latA, lngA, latB, lngB) <= VENUE_PROXIMITY_MILES) {
      return true;
    }
  }

  // Name substring check
  if (nameA && nameB) {
    const normA = normalizeForComparison(nameA);
    const normB = normalizeForComparison(nameB);
    if (normA.includes(normB) || normB.includes(normA)) {
      return true;
    }
  }

  return false;
}

// ─── Core dedup logic ─────────────────────────────────────────────────────────

export interface DedupResult {
  /** Whether a canonical match was found */
  isMatch: boolean;
  /** The canonical event's ID if matched */
  canonicalEventId?: string;
  /** Whether the incoming event has higher trust and the canonical should be updated */
  shouldUpdateCanonical: boolean;
}

/**
 * Checks if a canonical event already exists for the incoming event.
 * Queries only within a ±30-minute window around startAt for efficiency.
 *
 * Returns a DedupResult. The caller should:
 * - If isMatch && !shouldUpdateCanonical: only append to ticketUrls, skip insert
 * - If isMatch && shouldUpdateCanonical: update canonical core fields + ticketUrls
 * - If !isMatch: proceed with normal insert (but initialize ticketUrls)
 */
export async function findCanonicalMatch(
  incoming: IncomingEventForDedup
): Promise<DedupResult> {
  const windowStart = new Date(incoming.startAt.getTime() - THIRTY_MINUTES_MS);
  const windowEnd = new Date(incoming.startAt.getTime() + THIRTY_MINUTES_MS);

  // Fetch events within the time window, excluding events from the same source
  // (same-source dedup is already handled by the (externalId, sourceType) unique index)
  const candidates = await db
    .select({
      id: events.id,
      title: events.title,
      venueName: events.venueName,
      lat: events.lat,
      lng: events.lng,
      startAt: events.startAt,
      sourceType: events.sourceType,
      ticketUrls: events.ticketUrls,
      mergedSourceIds: events.mergedSourceIds,
      platform: events.platform,
      externalId: events.externalId,
    })
    .from(events)
    .where(
      and(
        gte(events.startAt, windowStart),
        lte(events.startAt, windowEnd),
        eq(events.status, 'active'),
        // Don't try to dedup against yourself
        ne(events.sourceType, incoming.sourceType as any)
      )
    );

  for (const candidate of candidates) {
    const timeMatch = areStartTimesClose(new Date(candidate.startAt), incoming.startAt);
    const venueMatch = areVenuesSimilar(
      candidate.venueName, candidate.lat, candidate.lng,
      incoming.venueName, incoming.lat, incoming.lng
    );
    const titleMatch = areTitlesSimilar(candidate.title, incoming.title);

    if (timeMatch && venueMatch && titleMatch) {
      const incomingTrust = getTrustScore(incoming.sourceType);
      const canonicalTrust = getTrustScore(candidate.sourceType);

      return {
        isMatch: true,
        canonicalEventId: candidate.id,
        shouldUpdateCanonical: incomingTrust > canonicalTrust,
      };
    }
  }

  return { isMatch: false, shouldUpdateCanonical: false };
}

/**
 * Builds the initial ticketUrls array for a brand-new canonical event.
 */
export function buildInitialTicketUrls(event: IncomingEventForDedup): TicketUrlEntry[] {
  if (!event.ticketUrl && !event.platform) return [];
  return [
    {
      platform: event.platform ?? 'unknown',
      url: event.ticketUrl,
      priceMin: event.priceMin,
      priceMax: event.priceMax,
      isFree: event.isFree,
    },
  ];
}

/**
 * Merges an incoming event's ticket source into an existing canonical event.
 * - Appends the incoming source to ticketUrls (if not already present)
 * - Appends to mergedSourceIds for auditability
 * - If shouldUpdateCanonical, returns updated core fields too
 */
export async function mergeIntoCanonical(
  canonicalId: string,
  incoming: IncomingEventForDedup,
  incomingCoreFields: Record<string, unknown>,
  shouldUpdateCanonical: boolean
): Promise<void> {
  const [canonical] = await db
    .select({
      ticketUrls: events.ticketUrls,
      mergedSourceIds: events.mergedSourceIds,
    })
    .from(events)
    .where(eq(events.id, canonicalId));

  if (!canonical) return;

  const existingTicketUrls = (canonical.ticketUrls as TicketUrlEntry[]) ?? [];
  const existingMergedSourceIds = (canonical.mergedSourceIds as MergedSourceEntry[]) ?? [];

  // Check if this source is already represented in ticketUrls
  const alreadyMerged = existingTicketUrls.some(
    (entry) => entry.platform?.toLowerCase() === (incoming.platform ?? '').toLowerCase()
  );

  const newTicketUrl: TicketUrlEntry = {
    platform: incoming.platform ?? 'unknown',
    url: incoming.ticketUrl,
    priceMin: incoming.priceMin,
    priceMax: incoming.priceMax,
    isFree: incoming.isFree,
  };

  const updatedTicketUrls = alreadyMerged
    ? existingTicketUrls
    : [...existingTicketUrls, newTicketUrl];

  const updatedMergedSourceIds: MergedSourceEntry[] = [
    ...existingMergedSourceIds,
    {
      externalId: incoming.externalId,
      sourceType: incoming.sourceType,
      platform: incoming.platform ?? 'unknown',
    },
  ];

  const updatePayload: Record<string, unknown> = {
    ticketUrls: updatedTicketUrls,
    mergedSourceIds: updatedMergedSourceIds,
    updatedAt: new Date(),
  };

  // If incoming source has higher trust, promote its core data to the canonical
  if (shouldUpdateCanonical) {
    Object.assign(updatePayload, incomingCoreFields);
    // Preserve the merged arrays we just built
    updatePayload.ticketUrls = updatedTicketUrls;
    updatePayload.mergedSourceIds = updatedMergedSourceIds;
  }

  await db.update(events).set(updatePayload).where(eq(events.id, canonicalId));

  console.log(
    `[Dedup] Merged ${incoming.platform ?? incoming.sourceType} event "${incoming.title}" into canonical ${canonicalId}` +
    (shouldUpdateCanonical ? ' (promoted to canonical)' : '')
  );
}
