/**
 * Venue registry / entity-resolution service.
 *
 * `resolveVenue()` is the single entry point every ingestor should call to turn a
 * raw, source-specific venue string ("Elsewhere - Zone One", "ROSALIA", a bare
 * address) into a stable canonical venue row. It replaces the previous pattern of
 * each source independently re-geocoding the same name on every event, which
 * produced coordinate scatter, generic-centroid leaks, and dedup misses.
 *
 * Resolution order (cheapest / most-certain first):
 *   1. Exact normalized-name hit on `venues`
 *   2. Exact normalized-alias hit on `venue_aliases`
 *   3. Proximity + shared-name-token match against existing venues (records an alias)
 *   4. No match → geocode once, validate, insert a new canonical venue
 *
 * Coordinate trust: a matched existing venue's coordinates win (manual overrides
 * live there), and are backfilled from the incoming event only when the venue has
 * none. New venues take valid source-provided coordinates, else a single geocode.
 */

import { db } from '@/db';
import { venues, venueAliases, events } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { normalizeVenueName, tokenizeVenueName } from '@/lib/utils/normalizeVenueName';
import { jaccardSimilarity } from '@/lib/utils/venueMatching';
import { calculateDistanceMeters } from '@/lib/utils/calculateDistance';
import { geocodeWithMapbox } from '@/lib/utils/geocode';
import { isValidLocation } from '@/lib/ingestion/location-validation';

// ─── Tuning ─────────────────────────────────────────────────────────────────

/**
 * Two coordinates closer than this AND sharing a distinctive name token are
 * treated as the same venue. Kept tight (a NYC block is ~80m) because the name-
 * token check — not distance alone — is what confirms identity. This is the
 * safe, AND-gated version of the old 160m proximity-OR that could merge
 * genuinely different neighboring venues.
 */
const PROXIMITY_MATCH_METERS = 150;

/** Minimum Jaccard overlap of name tokens to accept a proximity match. */
const MIN_TOKEN_JACCARD = 0.5;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ResolveVenueInput {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  sourceType: string;
}

export type VenueMatchMethod = 'exact_name' | 'alias' | 'proximity' | 'created';

export interface ResolvedVenue {
  venueId: string;
  canonicalName: string;
  lat: number | null;
  lng: number | null;
  matchedBy: VenueMatchMethod;
}

interface VenueRow {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolves a raw venue reference to a canonical venue row, creating one if needed.
 * Returns null when the name is unusable (empty / "Unknown Venue") — callers
 * should fall back to their existing per-event location handling in that case.
 */
export async function resolveVenue(input: ResolveVenueInput): Promise<ResolvedVenue | null> {
  const normalized = normalizeVenueName(input.name);
  if (!normalized || input.name.trim().toLowerCase() === 'unknown venue') {
    return null;
  }

  // 1. Exact canonical-name match ────────────────────────────────────────────
  const [exact] = await db
    .select({ id: venues.id, name: venues.name, lat: venues.lat, lng: venues.lng })
    .from(venues)
    .where(eq(venues.normalizedName, normalized))
    .limit(1);

  if (exact) {
    return finalizeMatch(exact, input, 'exact_name');
  }

  // 2. Exact alias match ──────────────────────────────────────────────────────
  const [alias] = await db
    .select({ venueId: venueAliases.venueId })
    .from(venueAliases)
    .where(eq(venueAliases.normalizedAlias, normalized))
    .limit(1);

  if (alias) {
    const [aliasVenue] = await db
      .select({ id: venues.id, name: venues.name, lat: venues.lat, lng: venues.lng })
      .from(venues)
      .where(eq(venues.id, alias.venueId))
      .limit(1);
    if (aliasVenue) {
      return finalizeMatch(aliasVenue, input, 'alias');
    }
  }

  // Determine the best coordinates we can, for proximity matching and/or creation.
  const resolvedCoords = await resolveCoordinates(input);

  // 3. Proximity + shared-token match ─────────────────────────────────────────
  if (resolvedCoords) {
    const incomingTokens = tokenizeVenueName(input.name);
    const candidates = await db
      .select({ id: venues.id, name: venues.name, lat: venues.lat, lng: venues.lng })
      .from(venues);

    // Building-level model: when several nearby venues match (e.g. "Elsewhere",
    // "Zone One, Elsewhere", "The Rooftop, Elsewhere"), attach to the most general
    // one — the fewest-token name, which is the building rather than a room.
    // Tie-break on nearest distance.
    let best: { venue: VenueRow; distance: number; tokenCount: number } | null = null;
    for (const candidate of candidates) {
      if (candidate.lat == null || candidate.lng == null) continue;
      const distance = calculateDistanceMeters(
        resolvedCoords.lat,
        resolvedCoords.lng,
        candidate.lat,
        candidate.lng
      );
      if (distance > PROXIMITY_MATCH_METERS) continue;
      const tokenCount = tokenizeVenueName(candidate.name).size;
      if (!namesShareIdentity(incomingTokens, tokenizeVenueName(candidate.name))) continue;
      const isBetter =
        !best ||
        tokenCount < best.tokenCount ||
        (tokenCount === best.tokenCount && distance < best.distance);
      if (isBetter) {
        best = { venue: candidate, distance, tokenCount };
      }
    }

    if (best) {
      // Record the incoming name as an alias so the next lookup is O(1).
      await recordAlias(best.venue.id, input.name, normalized, input.sourceType);
      return finalizeMatch(best.venue, input, 'proximity');
    }
  }

  // 4. Create a new canonical venue ───────────────────────────────────────────
  return createVenue(input, normalized, resolvedCoords);
}

/**
 * Merges one or more duplicate venues into a canonical venue:
 *   - repoints any events referencing a duplicate to the canonical venue
 *   - moves the duplicates' aliases onto the canonical venue
 *   - records each duplicate's own name as a canonical alias
 *   - deletes the duplicate venue rows
 *
 * Used to collapse pre-existing seed fragmentation (e.g. "Zone One, Elsewhere"
 * into "Elsewhere") and by the historical event backfill. No-op for ids that
 * equal the canonical id.
 */
export async function mergeVenuesInto(
  canonicalId: string,
  duplicateIds: string[]
): Promise<{ mergedVenues: number; repointedEvents: number }> {
  const toMerge = duplicateIds.filter((id) => id !== canonicalId);
  if (toMerge.length === 0) return { mergedVenues: 0, repointedEvents: 0 };

  const duplicates = await db
    .select({ id: venues.id, name: venues.name, normalizedName: venues.normalizedName })
    .from(venues)
    .where(inArray(venues.id, toMerge));

  // Repoint events off the duplicate venues.
  const repointed = await db
    .update(events)
    .set({ venueId: canonicalId, updatedAt: new Date() })
    .where(inArray(events.venueId, toMerge))
    .returning({ id: events.id });

  // Move existing aliases of the duplicates onto the canonical venue.
  await db
    .update(venueAliases)
    .set({ venueId: canonicalId })
    .where(inArray(venueAliases.venueId, toMerge));

  // Record each duplicate's own name as an alias of the canonical venue.
  for (const duplicate of duplicates) {
    const normalized = duplicate.normalizedName ?? normalizeVenueName(duplicate.name);
    if (normalized) {
      await recordAlias(canonicalId, duplicate.name, normalized, 'venue_merge');
    }
  }

  await db.delete(venues).where(inArray(venues.id, toMerge));

  return { mergedVenues: duplicates.length, repointedEvents: repointed.length };
}

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Confirms two venue-name token sets refer to the same place: either strong
 * Jaccard overlap, or full containment of the smaller set in the larger
 * (handles "elsewhere" ⊆ "elsewhere zone one").
 */
function namesShareIdentity(tokensA: Set<string>, tokensB: Set<string>): boolean {
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  if (jaccardSimilarity(tokensA, tokensB) >= MIN_TOKEN_JACCARD) return true;

  const [small, large] = tokensA.size <= tokensB.size ? [tokensA, tokensB] : [tokensB, tokensA];
  for (const token of small) {
    if (!large.has(token)) return false;
  }
  return true; // every token of the smaller name is present in the larger
}

/**
 * Picks the coordinates to use for an incoming venue: valid source-provided
 * coords are trusted as-is; otherwise a single geocode is attempted.
 */
async function resolveCoordinates(
  input: ResolveVenueInput
): Promise<{ lat: number; lng: number } | null> {
  if (input.lat != null && input.lng != null && isValidLocation(input.lat, input.lng)) {
    return { lat: input.lat, lng: input.lng };
  }
  const query = input.address ? `${input.name}, ${input.address}` : `${input.name}, New York, NY`;
  const geo = await geocodeWithMapbox(input.name, query);
  if (geo && isValidLocation(geo.lat, geo.lng)) {
    return { lat: geo.lat, lng: geo.lng };
  }
  return null;
}

/**
 * Returns the resolved venue, backfilling the venue's coordinates from the
 * incoming event when the stored row has none.
 */
async function finalizeMatch(
  venue: VenueRow,
  input: ResolveVenueInput,
  matchedBy: VenueMatchMethod
): Promise<ResolvedVenue> {
  let { lat, lng } = venue;

  if ((lat == null || lng == null) && input.lat != null && input.lng != null && isValidLocation(input.lat, input.lng)) {
    lat = input.lat;
    lng = input.lng;
    await db
      .update(venues)
      .set({ lat, lng, updatedAt: new Date() })
      .where(eq(venues.id, venue.id));
  }

  return { venueId: venue.id, canonicalName: venue.name, lat, lng, matchedBy };
}

async function recordAlias(
  venueId: string,
  alias: string,
  normalizedAlias: string,
  sourceType: string
): Promise<void> {
  try {
    await db.insert(venueAliases).values({ venueId, alias, normalizedAlias, sourceType });
  } catch {
    // Unique-index collision means another path already recorded this alias — fine.
  }
}

async function createVenue(
  input: ResolveVenueInput,
  normalized: string,
  coords: { lat: number; lng: number } | null
): Promise<ResolvedVenue> {
  try {
    const [created] = await db
      .insert(venues)
      .values({
        name: input.name.trim(),
        normalizedName: normalized,
        address: input.address ?? null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      })
      .returning({ id: venues.id, name: venues.name, lat: venues.lat, lng: venues.lng });

    return {
      venueId: created.id,
      canonicalName: created.name,
      lat: created.lat,
      lng: created.lng,
      matchedBy: 'created',
    };
  } catch {
    // Likely a concurrent insert of the same normalized name — re-fetch and return it.
    const [existing] = await db
      .select({ id: venues.id, name: venues.name, lat: venues.lat, lng: venues.lng })
      .from(venues)
      .where(eq(venues.normalizedName, normalized))
      .limit(1);
    if (existing) {
      return finalizeMatch(existing, input, 'exact_name');
    }
    throw new Error(`resolveVenue: failed to create or re-fetch venue "${input.name}"`);
  }
}
