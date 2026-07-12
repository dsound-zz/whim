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
import { calculateDistanceMiles } from '@/lib/utils/calculateDistance';
import {
  normalizeForComparison,
  jaccardSimilarity,
  tokenize,
  areVenuesSimilar,
} from '@/lib/utils/venueMatching';

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
  /** Canonical venue id from the registry. When present on both events, it is
   *  the authoritative venue-match signal (beats fuzzy name/coord matching). */
  venueId?: string | null;
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
  llm_extraction: 0.45,
};

function getTrustScore(sourceType: string): number {
  return SOURCE_TRUST_SCORES[sourceType] ?? 0.5;
}

// ─── Matching helpers ─────────────────────────────────────────────────────────

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const MIN_TITLE_SIMILARITY = 0.55;  // Jaccard similarity threshold (raised from 0.4 to reduce false merges)

function areStartTimesClose(timeA: Date, timeB: Date): boolean {
  return Math.abs(timeA.getTime() - timeB.getTime()) <= THIRTY_MINUTES_MS;
}

/**
 * Returns true if two event titles plausibly name the same show. Beyond plain
 * Jaccard overlap, this accepts full token containment — the case that broke the
 * old threshold: "Rosalía" ⊆ "Rosalía: LUX TOUR 2026", or an artist name inside
 * an artist + tour-name string. Containment is only trusted alongside the caller's
 * venue + ±30min gates, which make a false merge of two distinct shows unlikely.
 */
function areTitlesSimilar(titleA: string, titleB: string): boolean {
  const tokensA = tokenize(titleA);
  const tokensB = tokenize(titleB);
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  if (jaccardSimilarity(tokensA, tokensB) >= MIN_TITLE_SIMILARITY) return true;

  // Token containment: every token of the shorter title appears in the longer.
  const [small, large] = tokensA.size <= tokensB.size ? [tokensA, tokensB] : [tokensB, tokensA];
  for (const token of small) {
    if (!large.has(token)) return false;
  }
  return true;
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
      venueId: events.venueId,
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

    // Venue match: when both events carry a canonical venueId from the registry,
    // that identity is authoritative (this is the whole point of the registry —
    // "Madison Square Garden" from Ticketmaster and Songkick now share an id).
    // Fall back to fuzzy name/coord matching only when a venueId is missing.
    const venueMatch =
      incoming.venueId != null && candidate.venueId != null
        ? incoming.venueId === candidate.venueId
        : areVenuesSimilar(
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
