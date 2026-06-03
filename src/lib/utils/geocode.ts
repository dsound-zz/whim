/**
 * Unified Mapbox geocoding utility.
 *
 * This is the single source of truth for all geocoding in the Whim pipeline.
 * Previously there were 3 separate implementations with different bounding boxes,
 * type filters, and error handling — causing coordinate drift false positives
 * between ingestion and verification.
 *
 * Callsites:
 *  - src/lib/ingestion/location-validation.ts  (resolveLocationData)
 *  - src/lib/ingestion/nycParks.ts             (geocodeVenue fallback)
 *  - src/lib/verification/verifyEventIntegrity.ts (coordinate re-check)
 *  - scripts/scrape-ra.ts                      (venue geocoding)
 */

import { db } from '@/db';
import { venues } from '@/db/schema';
import { ilike } from 'drizzle-orm';
import { sanitizeAddressForGeocoding } from '@/lib/utils/sanitizeAddress';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeocodeResult {
  lat: number;
  lng: number;
  placeName: string;
}

export interface GeocodingOptions {
  /** Mapbox bbox parameter: "minLng,minLat,maxLng,maxLat" */
  boundingBox?: string;
  /** Mapbox proximity bias: "lng,lat" */
  proximity?: string;
  /** Mapbox `types` filter (e.g., "poi,address") */
  types?: string;
  /** Max results to request from Mapbox */
  limit?: number;
  /** If true, skip the local venue DB lookup (useful for verification re-checks) */
  skipVenueDbLookup?: boolean;
  /** If true, sanitize the query string to strip secondary unit designations */
  sanitizeAddress?: boolean;
}

// ─── Defaults (NYC) ───────────────────────────────────────────────────────────
// These will become parameterized via CityConfig in Phase 4.

const DEFAULT_BOUNDING_BOX = '-74.2591,40.4774,-73.7004,40.9176';
const DEFAULT_PROXIMITY = '-74.0060,40.7128'; // NYC center

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Geocodes a query string using the Mapbox Geocoding API.
 *
 * Pipeline:
 * 1. (Optional) Check local venue DB for a known override by venue name
 * 2. Call Mapbox with bounding box, proximity bias, and optional type filters
 * 3. Validate that the result falls within the bounding box
 *
 * @param venueName  The venue name (used for DB lookup and Mapbox query)
 * @param queryText  The full query string (e.g., "Blue Note Jazz Club, 131 W 3rd St, New York, NY")
 * @param options    Optional geocoding configuration
 * @returns          GeocodeResult or null if geocoding failed or returned out-of-bounds results
 */
export async function geocodeWithMapbox(
  venueName: string,
  queryText: string,
  options: GeocodingOptions = {}
): Promise<GeocodeResult | null> {
  if (!venueName || venueName === 'Unknown Venue') {
    return null;
  }

  const {
    boundingBox = DEFAULT_BOUNDING_BOX,
    proximity = DEFAULT_PROXIMITY,
    types,
    limit = 1,
    skipVenueDbLookup = false,
    sanitizeAddress: shouldSanitize = true,
  } = options;

  // Step 1: Check local DB for known venue override
  if (!skipVenueDbLookup) {
    const venueOverride = await lookupVenueInDb(venueName, boundingBox);
    if (venueOverride) {
      return venueOverride;
    }
  }

  // Step 2: Call Mapbox
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!mapboxToken) {
    console.warn('[Geocoder] NEXT_PUBLIC_MAPBOX_TOKEN is not set — cannot geocode');
    return null;
  }

  try {
    const sanitizedQuery = shouldSanitize
      ? sanitizeAddressForGeocoding(queryText)
      : queryText;
    const encodedQuery = encodeURIComponent(sanitizedQuery);

    let url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json` +
      `?access_token=${mapboxToken}` +
      `&bbox=${boundingBox}` +
      `&proximity=${proximity}` +
      `&limit=${limit}`;

    if (types) {
      url += `&types=${types}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[Geocoder] HTTP ${response.status} for "${venueName}"`);
      return null;
    }

    const data = await response.json();
    const firstFeature = data?.features?.[0];
    if (!firstFeature) {
      return null;
    }

    const [resolvedLng, resolvedLat] = firstFeature.geometry?.coordinates ??
      firstFeature.center ?? [];

    if (resolvedLat == null || resolvedLng == null) {
      return null;
    }

    // Step 3: Validate result is within bounding box
    const bboxParts = boundingBox.split(',').map(Number);
    const [bboxMinLng, bboxMinLat, bboxMaxLng, bboxMaxLat] = bboxParts;

    if (
      resolvedLat < bboxMinLat || resolvedLat > bboxMaxLat ||
      resolvedLng < bboxMinLng || resolvedLng > bboxMaxLng
    ) {
      console.warn(
        `[Geocoder] Result for "${venueName}" (${resolvedLat}, ${resolvedLng}) is outside bounding box. Rejecting.`
      );
      return null;
    }

    return {
      lat: resolvedLat,
      lng: resolvedLng,
      placeName: firstFeature.place_name as string,
    };
  } catch (error) {
    console.error(`[Geocoder] Failed for "${venueName}":`, error);
    return null;
  }
}

// ─── Venue DB Lookup ──────────────────────────────────────────────────────────

/**
 * Checks the local venues table for a known coordinate override.
 * Uses case-insensitive matching on venue name.
 *
 * IMPORTANT: The cached coordinates are validated against the active bounding box
 * before being returned. This prevents stale or incorrectly-geocoded venue rows
 * (e.g. a venue name matching a suburb entry) from bypassing all downstream
 * validation and poisoning newly-ingested events with wrong coordinates.
 */
async function lookupVenueInDb(
  venueName: string,
  boundingBox: string = DEFAULT_BOUNDING_BOX
): Promise<GeocodeResult | null> {
  try {
    const existingVenues = await db
      .select({
        lat: venues.lat,
        lng: venues.lng,
        address: venues.address,
        name: venues.name,
      })
      .from(venues)
      .where(ilike(venues.name, venueName))
      .limit(1);

    if (existingVenues.length > 0 && existingVenues[0].lat && existingVenues[0].lng) {
      const cachedLat = existingVenues[0].lat;
      const cachedLng = existingVenues[0].lng;

      // Validate cached coordinates are within the active bounding box.
      // Without this check, a venue row with wrong/suburban coordinates would be
      // returned unconditionally, bypassing all Mapbox and isValidLocation guards.
      const bboxParts = boundingBox.split(',').map(Number);
      const [bboxMinLng, bboxMinLat, bboxMaxLng, bboxMaxLat] = bboxParts;

      const isCachedWithinBbox =
        cachedLat >= bboxMinLat && cachedLat <= bboxMaxLat &&
        cachedLng >= bboxMinLng && cachedLng <= bboxMaxLng;

      if (!isCachedWithinBbox) {
        console.warn(
          `[Geocoder] Cached coords for "${venueName}" (${cachedLat}, ${cachedLng}) ` +
          `are outside the active bounding box — falling through to Mapbox.`
        );
        return null;
      }

      return {
        lat: cachedLat,
        lng: cachedLng,
        placeName: existingVenues[0].address ?? `${existingVenues[0].name}, New York, NY`,
      };
    }
  } catch (error) {
    console.error(`[Geocoder] DB lookup failed for "${venueName}":`, error);
  }

  return null;
}
