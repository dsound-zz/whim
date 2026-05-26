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
  lat?: number | null;
  lng?: number | null;
}

import { resolveLocationData } from './location-validation';

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

  // Geocode venue with fallback
  const addressString = rawEvent.venueAddress || `${rawEvent.venueName}, New York, NY`;
  const locationData = await resolveLocationData(
    rawEvent.venueName,
    addressString,
    rawEvent.lat,
    rawEvent.lng
  );

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
    lat: locationData.lat,
    lng: locationData.lng,
    isFree: false,             // Songkick events are almost universally ticketed
    priceMin: null,            // Songkick doesn't expose price in listings
    priceMax: null,
    currency: 'USD',
    ticketUrl,
    platform: 'songkick',
    confidenceScore: 0.85,
    isVerified: locationData.isVerified,
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
        isVerified: eventToInsert.isVerified,
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
