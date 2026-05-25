import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq, isNull, gt } from 'drizzle-orm';

export interface IngestionResult {
  eventsUpserted: number;
  eventsSkipped: number;
  errors: number;
  durationMs: number;
}

interface BandsintownArtist {
  id: string;
  name: string;
  image_url?: string;
  thumb_url?: string;
  tracker_count?: number;
  upcoming_event_count?: number;
  url?: string;
  errors?: string[];
}

export async function enrichEventWithBandsintown(
  eventId: string,
  artistName: string
): Promise<boolean> {
  const appId = process.env.BANDSINTOWN_APP_ID || 'whim-events-app';
  if (!appId) {
    console.warn('[Bandsintown] BANDSINTOWN_APP_ID not set, skipping enrichment');
    return false;
  }

  const encodedArtist = encodeURIComponent(artistName);
  const artistUrl = `https://rest.bandsintown.com/artists/${encodedArtist}?app_id=${appId}`;

  try {
    const artistResponse = await fetch(artistUrl);
    
    if (artistResponse.status === 404) {
      // Artist not found on Bandsintown
      return false;
    }

    if (!artistResponse.ok) {
      console.warn(`[Bandsintown] HTTP ${artistResponse.status} for artist "${artistName}"`);
      return false;
    }

    const artist: BandsintownArtist = await artistResponse.json();

    if (artist && artist.image_url && !artist.errors) {
      const updatedRows = await db
        .update(events)
        .set({
          imageUrl: artist.image_url,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(events.id, eventId),
            isNull(events.imageUrl)  // Only update if still null
          )
        );
      return true;
    }
  } catch (error) {
    console.error(`[Bandsintown] Request failed for artist "${artistName}":`, error);
  }
  return false;
}

export async function runBandsintownEnrichment(): Promise<IngestionResult> {
  const startTime = Date.now();
  let eventsUpserted = 0;
  let eventsSkipped = 0;
  let errors = 0;

  try {
    // Find active music events starting in the future that have a null imageUrl
    const eventsNeedingEnrichment = await db
      .select({
        id: events.id,
        title: events.title,
      })
      .from(events)
      .where(
        and(
          isNull(events.imageUrl),
          eq(events.category, 'music'),
          eq(events.status, 'active'),
          gt(events.startAt, new Date())
        )
      )
      .limit(100);

    console.log(`[Bandsintown] Found ${eventsNeedingEnrichment.length} events needing enrichment`);

    for (const event of eventsNeedingEnrichment) {
      try {
        // Extract artist name by taking everything before the first " at " or " @ "
        // E.g., "Artist Name at Venue" or "Artist Name @ Venue"
        let artistName = event.title.split(/\s+at\s+|\s+@\s+/i)[0].trim();
        
        // Clean up festival details or special characters from artist name if needed
        // But split on " at " is the primary standard
        if (artistName.length < 2) {
          eventsSkipped++;
          continue;
        }

        console.log(`[Bandsintown] Enriching event: "${event.title}" -> Artist: "${artistName}"`);
        const success = await enrichEventWithBandsintown(event.id, artistName);
        
        if (success) {
          eventsUpserted++;
        } else {
          eventsSkipped++;
        }

        // Rate limit: Bandsintown's public API rate-limiting delay
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`[Bandsintown] Enrichment failed for event ID ${event.id}:`, error);
        errors++;
      }
    }
  } catch (error) {
    console.error('[Bandsintown] Fatal error during enrichment run:', error);
    errors++;
  }

  return {
    eventsUpserted,
    eventsSkipped,
    errors,
    durationMs: Date.now() - startTime,
  };
}
