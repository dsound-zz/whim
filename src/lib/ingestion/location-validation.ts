import { db } from '@/db';
import { venues } from '@/db/schema';
import { ilike } from 'drizzle-orm';

// Known generic centroids that we want to reject
export const GENERIC_CENTROIDS = [
  { lat: 40.664017, lng: -73.88818, name: 'Payne/East NY' },
  { lat: 40.712749, lng: -74.005994, name: 'Generic NYC' },
  { lat: 40.6526, lng: -73.9497, name: 'Generic Brooklyn' },
];

/**
 * NYC bounding box. Any geocoded coordinate outside this range is not in New York City.
 * Format: [minLng, minLat, maxLng, maxLat] (Mapbox bbox parameter order)
 */
export const NYC_BOUNDING_BOX = {
  minLat: 40.4774,
  maxLat: 40.9176,
  minLng: -74.2591,
  maxLng: -73.7004,
  mapboxParam: '-74.2591,40.4774,-73.7004,40.9176',
};

/**
 * Returns true if the coordinate is within the NYC bounding box.
 */
export function isWithinNYC(lat: number, lng: number): boolean {
  return (
    lat >= NYC_BOUNDING_BOX.minLat &&
    lat <= NYC_BOUNDING_BOX.maxLat &&
    lng >= NYC_BOUNDING_BOX.minLng &&
    lng <= NYC_BOUNDING_BOX.maxLng
  );
}

/**
 * Checks if a given lat/lng closely matches any of the known generic centroids.
 * We use a small epsilon (e.g., 0.005) to account for floating-point or slight variations.
 * Also rejects coordinates that fall outside the NYC bounding box.
 */
export function isValidLocation(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;

  // Reject coordinates outside NYC entirely
  if (!isWithinNYC(lat, lng)) {
    return false;
  }

  const EPSILON = 0.005; // ~500 meters
  for (const centroid of GENERIC_CENTROIDS) {
    if (Math.abs(lat - centroid.lat) < EPSILON && Math.abs(lng - centroid.lng) < EPSILON) {
      return false; // Matched a generic centroid, so it's NOT valid
    }
  }

  return true; // Valid coordinates
}

/**
 * Geocodes a venue name and query string inside NYC bounding box using Mapbox.
 */
export async function geocodeVenueWithMapbox(
  venueName: string,
  queryText: string
): Promise<{ lat: number; lng: number } | null> {
  if (!venueName || venueName === 'Unknown Venue') {
    return null;
  }

  // 1. Check local DB for known venue override
  try {
    const existing = await db
      .select()
      .from(venues)
      .where(ilike(venues.name, venueName))
      .limit(1);
      
    if (existing.length > 0 && existing[0].lat && existing[0].lng) {
      return { lat: existing[0].lat, lng: existing[0].lng };
    }
  } catch (err) {
    console.error(`[Geocoder] DB check failed for "${venueName}":`, err);
  }

  // 2. Fallback to Mapbox
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!mapboxToken) {
    return null;
  }

  try {
    const query = encodeURIComponent(queryText);
    const proximity = '-74.0060,40.7128'; // NYC center
    // bbox restricts Mapbox results to NYC — prevents e.g. "Brooklyn Bowl" resolving to Las Vegas
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&limit=1&proximity=${proximity}&bbox=${NYC_BOUNDING_BOX.mapboxParam}`;

    const geoRes = await fetch(url);
    if (!geoRes.ok) {
      console.warn(`[Geocoder] HTTP ${geoRes.status} for "${venueName}"`);
      return null;
    }
    const geoData = await geoRes.json();

    if (geoData.features && geoData.features.length > 0) {
      const center = geoData.features[0].center; // [lng, lat]
      const resolvedLng = center[0];
      const resolvedLat = center[1];

      // Final guard: even with bbox param, double-check the result is within NYC
      if (!isWithinNYC(resolvedLat, resolvedLng)) {
        console.warn(`[Geocoder] Result for "${venueName}" (${resolvedLat}, ${resolvedLng}) is outside NYC bounds. Rejecting.`);
        return null;
      }

      return {
        lng: resolvedLng,
        lat: resolvedLat,
      };
    }
  } catch (err) {
    console.error(`[Geocoder] Failed for "${venueName}":`, err);
  }
  return null;
}

/**
 * Evaluates an address string to detect if it is highly generic (e.g. lacks a street number,
 * or matches city/state/country suffix strings).
 */
export function isGenericAddress(address: string | null | undefined): boolean {
  if (!address) return true;

  const trimmed = address.trim();

  // Pattern checks for strictly matches city/state/country suffix strings
  const genericPatterns = [
    /^brooklyn,\s*ny(,\s*us)?$/i,
    /^new\s*york\s*\(nyc\),\s*ny(,\s*us)?$/i,
    /^new\s*york,\s*ny(,\s*us)?$/i,
    /^manhattan,\s*ny(,\s*us)?$/i,
    /^bronx,\s*ny(,\s*us)?$/i,
    /^queens,\s*ny(,\s*us)?$/i,
    /^staten\s*island,\s*ny(,\s*us)?$/i,
    /^nyc(,\s*ny)?(,\s*us)?$/i,
    /^united\s*states$/i,
    /^us$/i,
  ];

  if (genericPatterns.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  // Check if it lacks a street number (does not start with a digit)
  const hasStreetNumber = /^\d+/.test(trimmed);
  if (!hasStreetNumber) {
    return true;
  }

  return false;
}

/**
 * Validates initial coordinates (often from a scraper). If they are invalid (generic centroids),
 * or the address is generic, falls back to Mapbox API to find better coordinates.
 */
export async function resolveLocationData(
  venueName: string,
  address: string | null | undefined,
  initialLat: number | null | undefined,
  initialLng: number | null | undefined
): Promise<{ lat: number | null; lng: number | null; isVerified: boolean }> {
  
  const isInitialValid = isValidLocation(initialLat, initialLng);
  const isGeneric = isGenericAddress(address);
  
  if (isInitialValid && !isGeneric && initialLat != null && initialLng != null) {
    return {
      lat: initialLat,
      lng: initialLng,
      isVerified: true
    };
  }

  console.log(`[LocationValidation] Initial coordinates (${initialLat}, ${initialLng}) for ${venueName} failed smoke test or address is generic. Triggering fallback.`);

  // Attempt geocoding fallback
  const searchAddress = address ? `${venueName}, ${address}` : `${venueName}, New York, NY`;
  const fallbackGeo = await geocodeVenueWithMapbox(venueName, searchAddress);

  if (fallbackGeo) {
    const isFallbackValid = isValidLocation(fallbackGeo.lat, fallbackGeo.lng);
    if (isFallbackValid) {
      return {
        lat: fallbackGeo.lat,
        lng: fallbackGeo.lng,
        isVerified: true
      };
    }
  }

  // If fallback fails/returns generic, but initial coordinates were valid, use them (unverified)
  if (isInitialValid && initialLat != null && initialLng != null) {
    return {
      lat: initialLat,
      lng: initialLng,
      isVerified: false
    };
  }

  return {
    lat: null,
    lng: null,
    isVerified: false
  };
}
