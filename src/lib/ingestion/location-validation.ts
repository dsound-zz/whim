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
 * Checks if a given lat/lng closely matches any of the known generic centroids.
 * We use a small epsilon (e.g., 0.005) to account for floating-point or slight variations.
 */
export function isValidLocation(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;

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
    const proximity = "-74.0060,40.7128"; // NYC center
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&limit=1&proximity=${proximity}`;

    const geoRes = await fetch(url);
    if (!geoRes.ok) {
      console.warn(`[Geocoder] HTTP ${geoRes.status} for "${venueName}"`);
      return null;
    }
    const geoData = await geoRes.json();

    if (geoData.features && geoData.features.length > 0) {
      const center = geoData.features[0].center; // [lng, lat]
      return {
        lng: center[0],
        lat: center[1],
      };
    }
  } catch (err) {
    console.error(`[Geocoder] Failed for "${venueName}":`, err);
  }
  return null;
}

/**
 * Validates initial coordinates (often from a scraper). If they are invalid (generic centroids),
 * falls back to Mapbox API to find better coordinates.
 */
export async function resolveLocationData(
  venueName: string,
  address: string | null | undefined,
  initialLat: number | null | undefined,
  initialLng: number | null | undefined
): Promise<{ lat: number | null; lng: number | null; isVerified: boolean }> {
  
  const isInitialValid = isValidLocation(initialLat, initialLng);
  
  if (isInitialValid && initialLat != null && initialLng != null) {
    return {
      lat: initialLat,
      lng: initialLng,
      isVerified: true
    };
  }

  console.log(`[LocationValidation] Initial coordinates (${initialLat}, ${initialLng}) for ${venueName} failed smoke test. Triggering fallback.`);

  // Attempt geocoding fallback
  const searchAddress = address ? `${venueName}, ${address}` : `${venueName}, New York, NY`;
  const fallbackGeo = await geocodeVenueWithMapbox(venueName, searchAddress);

  if (fallbackGeo) {
    const isFallbackValid = isValidLocation(fallbackGeo.lat, fallbackGeo.lng);
    return {
      lat: fallbackGeo.lat,
      lng: fallbackGeo.lng,
      isVerified: isFallbackValid
    };
  }

  // If fallback also fails, return the initial ones but marked as unverified
  return {
    lat: initialLat ?? null,
    lng: initialLng ?? null,
    isVerified: false
  };
}
