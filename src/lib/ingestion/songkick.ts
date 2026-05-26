import { db } from '@/db';
import { events, ingestionSources, venues } from '@/db/schema';
import { and, eq, ilike } from 'drizzle-orm';

export interface RawSongkickEvent {
  songkickId: string;
  title: string;
  artistNames: string[];
  dateText: string;        // ISO datetime string or human-readable
  venueName: string;
  venueAddress: string;    // may include city/state
  ticketUrl: string;       // relative or absolute URL
  imageUrl: string | null;
}

/**
 * Geocodes a venue name and query string inside NYC bounding box using Mapbox.
 */
export async function geocodeVenueName(
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
    console.error(`[Songkick Geocoder] DB check failed for "${venueName}":`, err);
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
      console.warn(`[Songkick Geocoder] HTTP ${geoRes.status} for "${venueName}"`);
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
    console.error(`[Songkick Geocoder] Failed for "${venueName}":`, err);
  }
  return null;
}

/**
 * Normalizes a raw scraped Songkick event into Whim event schema shape.
 */
export async function normalizeSongkickEvent(
  rawEvent: RawSongkickEvent
) {
  // Build full ticket URL
  const ticketUrl = rawEvent.ticketUrl.startsWith('http')
    ? rawEvent.ticketUrl
    : `https://www.songkick.com${rawEvent.ticketUrl}`;

  // Parse datetime — Songkick uses ISO 8601 in datetime attributes
  const startAt = rawEvent.dateText
    ? new Date(rawEvent.dateText)
    : new Date();

  // Build a descriptive title if the raw title is just the artist name
  const title = rawEvent.title || rawEvent.artistNames.join(', ') || 'Live Event';

  // Geocode venue
  let lat: number | null = null;
  let lng: number | null = null;

  const addressString = rawEvent.venueAddress || `${rawEvent.venueName}, New York, NY`;
  const geocodeQuery = `${rawEvent.venueName}, ${addressString}`;
  const geocoded = await geocodeVenueName(rawEvent.venueName, geocodeQuery);
  if (geocoded) {
    lat = geocoded.lat;
    lng = geocoded.lng;
  }

  return {
    externalId: rawEvent.songkickId,
    sourceType: 'songkick_scrape' as const,
    title,
    description: rawEvent.artistNames.length > 1
      ? `Featuring: ${rawEvent.artistNames.join(', ')}`
      : null,
    category: 'music' as const,         // Songkick is music-only
    imageUrl: rawEvent.imageUrl,
    startAt,
    endAt: null,
    venueName: rawEvent.venueName,
    address: addressString,
    lat,
    lng,
    isFree: false,             // Songkick events are almost universally ticketed
    priceMin: null,            // Songkick doesn't expose price in listings
    priceMax: null,
    currency: 'USD',
    ticketUrl,
    platform: 'songkick',
    confidenceScore: 0.85,
    isVerified: false,
    status: 'active' as const,
    rawSource: rawEvent,
  };
}

/**
 * Upserts a normalized event into the database.
 */
export async function upsertSongkickEvent(eventToInsert: any): Promise<void> {
  await db
    .insert(events)
    .values(eventToInsert)
    .onConflictDoUpdate({
      target: [events.externalId, events.sourceType],
      set: {
        title: eventToInsert.title,
        description: eventToInsert.description,
        category: eventToInsert.category,
        startAt: eventToInsert.startAt,
        endAt: eventToInsert.endAt,
        imageUrl: eventToInsert.imageUrl,
        venueName: eventToInsert.venueName,
        address: eventToInsert.address,
        lat: eventToInsert.lat,
        lng: eventToInsert.lng,
        isFree: eventToInsert.isFree,
        ticketUrl: eventToInsert.ticketUrl,
        platform: eventToInsert.platform,
        confidenceScore: eventToInsert.confidenceScore,
        rawSource: eventToInsert.rawSource,
        updatedAt: new Date(),
      },
    });
}

/**
 * Updates or inserts the status of the songkick_scrape source in ingestion_sources.
 */
export async function updateSongkickIngestionSourceStatus(
  status: 'active' | 'error',
  errorMessage: string | null = null
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(ingestionSources)
      .where(eq(ingestionSources.type, 'songkick_scrape'))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(ingestionSources)
        .set({
          lastSyncedAt: new Date(),
          syncStatus: status,
          errorMessage,
        })
        .where(eq(ingestionSources.type, 'songkick_scrape'));
    } else {
      await db
        .insert(ingestionSources)
        .values({
          type: 'songkick_scrape',
          syncStatus: status,
          errorMessage,
          lastSyncedAt: new Date(),
          config: {},
        });
    }
  } catch (err) {
    console.error('[Songkick Ingestion] Failed to update ingestion source status:', err);
  }
}
