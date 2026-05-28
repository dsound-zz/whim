import { db } from '@/db';
import { events, ingestionSources, venues } from '@/db/schema';
import { and, eq, ilike } from 'drizzle-orm';
import { resolveLocationData } from './location-validation';
import { validateEventDates } from '@/lib/utils/validateEventDates';
import { normalizeEventTitle, isTitleJustVenueName } from '@/lib/utils/normalizeEventTitle';
import { classifyEventCategory } from '@/lib/utils/categorizeEvent';

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

/**
 * Normalizes a raw scraped Songkick event into Whim event schema shape.
 * Returns null if the event fails date or title validation.
 */
export async function normalizeSongkickEvent(
  rawEvent: RawSongkickEvent
): Promise<typeof import('@/db/schema').events.$inferInsert | null> {
  // Build full ticket URL
  const ticketUrl = rawEvent.ticketUrl.startsWith('http')
    ? rawEvent.ticketUrl
    : `https://www.songkick.com${rawEvent.ticketUrl}`;

  // Parse datetime — Songkick uses ISO 8601 in datetime attributes
  const rawStartAt = rawEvent.dateText ? new Date(rawEvent.dateText) : new Date();

  const dateValidation = validateEventDates(rawStartAt, null);
  if (!dateValidation.isValid) {
    console.warn(`[Songkick] Skipping event ${rawEvent.songkickId}: ${dateValidation.rejectionReason}`);
    return null;
  }

  // Build a descriptive title if the raw title is just the artist name
  const rawTitle = rawEvent.title || rawEvent.artistNames.join(', ') || 'Live Event';
  let normalizedTitle = normalizeEventTitle(rawTitle) ?? rawTitle;

  // If the title is just the venue name, build a better one from artists
  if (isTitleJustVenueName(normalizedTitle, rawEvent.venueName) && rawEvent.artistNames.length > 0) {
    const artistTitle = rawEvent.artistNames.join(', ');
    normalizedTitle = normalizeEventTitle(artistTitle) ?? artistTitle;
  }

  const category = await classifyEventCategory({
    title: normalizedTitle,
    description: rawEvent.artistNames.length > 1
      ? `Featuring: ${rawEvent.artistNames.join(', ')}`
      : null,
    // Songkick is music-only; skip LLM — keyword scan will catch edge cases
    skipLlmFallback: true,
  });

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
    title: normalizedTitle,
    description: rawEvent.artistNames.length > 1
      ? `Featuring: ${rawEvent.artistNames.join(', ')}`
      : null,
    category,
    imageUrl: rawEvent.imageUrl,
    startAt: rawStartAt,
    endAt: dateValidation.sanitizedEndAt,
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
