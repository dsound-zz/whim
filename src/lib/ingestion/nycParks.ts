import { db } from '@/db';
import { events, ingestionSources } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { validateEventDates } from '@/lib/utils/validateEventDates';
import { normalizeEventTitle } from '@/lib/utils/normalizeEventTitle';
import { classifyEventCategory } from '@/lib/utils/categorizeEvent';
import { geocodeWithMapbox } from '@/lib/utils/geocode';
import { resolveVenueSafely } from '@/lib/db/venueService';
import {
  findCanonicalMatch,
  mergeIntoCanonical,
  buildInitialTicketUrls,
  type IncomingEventForDedup,
} from '@/lib/utils/deduplicateAtIngestion';

export interface IngestionResult {
  eventsUpserted: number;
  eventsSkipped: number;
  errors: number;
  durationMs: number;
}

interface NYCParksRawEvent {
  event_id?: string;
  title?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  location_description?: string;
  description?: string;
  snippet?: string;
  phone?: string;
  email?: string;
  cost_free?: string;
  cost_description?: string;
  must_see?: string;
  url?: string;
  notice?: string;
}

interface NYCParksRawLocation {
  event_id?: string;
  name?: string;
  park_id?: string;
  lat?: string;
  long?: string;
  address?: string;
  zip?: string;
  borough?: string;
  accessible?: string;
}

interface NYCParksRawImage {
  event_id?: string;
  path_2?: {
    url?: string;
  };
  path?: {
    url?: string;
  };
  main?: string;
}

function getBoroughName(code: string | undefined): string {
  if (!code) return 'New York';
  const c = code.toUpperCase();
  switch (c) {
    case 'M': return 'Manhattan';
    case 'B': return 'Brooklyn';
    case 'Q': return 'Queens';
    case 'X': return 'Bronx';
    case 'R': return 'Staten Island';
    default: return c;
  }
}

function parseDateTime(dateStr: string | undefined, timeStr: string | undefined): Date {
  if (!dateStr) return new Date();
  const dateObj = new Date(dateStr);
  if (!timeStr) return dateObj;

  const [hours, minutes] = timeStr.split(':').map(Number);
  if (!isNaN(hours) && !isNaN(minutes)) {
    dateObj.setHours(hours, minutes, 0, 0);
  }
  return dateObj;
}

export async function runNYCParksIngestion(): Promise<IngestionResult> {
  const startTime = Date.now();
  let eventsUpserted = 0;
  let eventsSkipped = 0;
  let errorsCount = 0;

  try {
    const today = new Date();
    const thirtyDaysOut = new Date(today);
    thirtyDaysOut.setDate(today.getDate() + 30);

    const dateTodayStr = today.toISOString().split('T')[0];
    const dateLimitStr = thirtyDaysOut.toISOString().split('T')[0];

    // Step 1: Query upcoming events
    const whereClause = `date >= '${dateTodayStr}T00:00:00' AND date <= '${dateLimitStr}T00:00:00'`;
    const params = new URLSearchParams({
      '$where': whereClause,
      '$limit': '1000',
      '$order': 'date ASC',
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (process.env.NYC_OPEN_DATA_APP_TOKEN) {
      headers['X-App-Token'] = process.env.NYC_OPEN_DATA_APP_TOKEN;
    }

    console.log('[NYC Parks] Querying Socrata API for upcoming events...');
    let eventsRes = await fetch(
      `https://data.cityofnewyork.us/resource/fudw-fgrp.json?${params}`,
      { headers }
    );
    let rawEvents: NYCParksRawEvent[] = await eventsRes.json();

    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      console.warn('[NYC Parks] 0 upcoming events found from Socrata API. This may indicate an off-season or API issue.');
      return { eventsUpserted: 0, eventsSkipped: 0, errors: 0, durationMs: Date.now() - startTime };
    }

    console.log(`[NYC Parks] Retrieved ${rawEvents.length} upcoming events.`);

    // Step 2: Extract unique event IDs
    const eventIds = rawEvents
      .map(e => e.event_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    // Build location and image maps by querying in chunks of 100 to avoid URI length issues
    const locationsMap = new Map<string, NYCParksRawLocation>();
    const imagesMap = new Map<string, string>();
    const chunkSize = 100;

    for (let i = 0; i < eventIds.length; i += chunkSize) {
      const chunk = eventIds.slice(i, i + chunkSize);
      const idListStr = chunk.map(id => `'${id}'`).join(',');
      const whereIdClause = `event_id in(${idListStr})`;

      // Fetch Locations for chunk
      try {
        const locParams = new URLSearchParams({
          '$where': whereIdClause,
          '$limit': '1000',
        });
        const locRes = await fetch(
          `https://data.cityofnewyork.us/resource/cpcm-i88g.json?${locParams}`,
          { headers }
        );
        const rawLocs: NYCParksRawLocation[] = await locRes.json();
        if (Array.isArray(rawLocs)) {
          for (const loc of rawLocs) {
            if (loc.event_id) locationsMap.set(loc.event_id, loc);
          }
        }
      } catch (err) {
        console.error('[NYC Parks] Failed to fetch locations chunk:', err);
      }

      // Fetch Images for chunk
      try {
        const imgParams = new URLSearchParams({
          '$where': whereIdClause,
          '$limit': '1000',
        });
        const imgRes = await fetch(
          `https://data.cityofnewyork.us/resource/6eti-k994.json?${imgParams}`,
          { headers }
        );
        const rawImgs: NYCParksRawImage[] = await imgRes.json();
        if (Array.isArray(rawImgs)) {
          for (const img of rawImgs) {
            const url = img.path_2?.url ?? img.path?.url;
            if (img.event_id && url) {
              imagesMap.set(img.event_id, url);
            }
          }
        }
      } catch (err) {
        console.error('[NYC Parks] Failed to fetch images chunk:', err);
      }
    }

    // Step 3: Process, geocode, and upsert each event
    for (const rawEvent of rawEvents) {
      if (!rawEvent.event_id) {
        eventsSkipped++;
        continue;
      }

      try {
        const location = locationsMap.get(rawEvent.event_id);
        const imageUrl = imagesMap.get(rawEvent.event_id) ?? null;

        // Resolve title, venue, and url
        const rawTitle = rawEvent.title ?? 'NYC Parks Event';
        const venueName = location?.name ?? rawEvent.location_description ?? 'NYC Park';
        const ticketUrl = rawEvent.url ? `https://www.nycgovparks.org/events/${rawEvent.url}` : null;
        
        let lat = location?.lat ? parseFloat(location.lat) : null;
        let lng = location?.long ? parseFloat(location.long) : null;
        let address = location?.address ?? rawEvent.location_description ?? venueName;
        const borough = location?.borough ?? '';

        // Geocode fallback using unified Mapbox geocoder if lat/lng is missing
        if ((lat === null || lng === null || isNaN(lat) || isNaN(lng)) && venueName) {
          const boroughName = getBoroughName(borough);
          const geocodeQuery = `${venueName}, ${boroughName}, New York City, NY, USA`;
          const geocoded = await geocodeWithMapbox(venueName, geocodeQuery);
          if (geocoded) {
            lat = geocoded.lat;
            lng = geocoded.lng;
            address = geocoded.placeName;
          }
        }

        // Apply clean address fallback with borough
        if (!location?.address && borough) {
          const bName = getBoroughName(borough);
          address = `${venueName}, ${bName}, NY`;
        }

        // Determine if free: NYC Parks are mostly free.
        // If cost_free is '1' or if cost_description / description doesn't mention '$'
        const isFree = rawEvent.cost_free === '1' || 
          (!rawEvent.cost_description?.toLowerCase().includes('$') && 
           !rawEvent.description?.toLowerCase().includes('$'));

        const startAt = parseDateTime(rawEvent.date, rawEvent.start_time);
        let endAt: Date | null = rawEvent.end_time ? parseDateTime(rawEvent.date, rawEvent.end_time) : null;

        const dateValidation = validateEventDates(startAt, endAt);
        if (!dateValidation.isValid) {
          console.warn(`[NYC Parks] Skipping event ${rawEvent.event_id}: ${dateValidation.rejectionReason}`);
          eventsSkipped++;
          continue;
        }
        endAt = dateValidation.sanitizedEndAt;

        // Normalize title using the shared utility
        const title = normalizeEventTitle(rawTitle) ?? rawTitle;

        // Classify category using shared classifier (rule-based; skip LLM for Parks events)
        const category = await classifyEventCategory({
          title,
          description: rawEvent.description ?? rawEvent.snippet,
          skipLlmFallback: false,
        });

        // Canonical venue resolution: venueId + shared registry coordinates.
        const resolvedVenue = await resolveVenueSafely({
          name: venueName,
          address,
          lat,
          lng,
          sourceType: 'nyc_parks_api',
        });
        if (resolvedVenue) {
          lat = resolvedVenue.lat;
          lng = resolvedVenue.lng;
        }

        const eventToInsert = {
          externalId: rawEvent.event_id,
          sourceType: 'nyc_parks_api' as const,
          title,
          description: rawEvent.description ?? rawEvent.snippet ?? null,
          category,
          imageUrl,
          startAt,
          endAt,
          venueId: resolvedVenue?.venueId ?? null,
          venueName,
          address,
          lat,
          lng,
          isFree,
          priceMin: isFree ? 0 : null,
          priceMax: null,
          currency: 'USD',
          ticketUrl,
          platform: 'nyc_parks',
          confidenceScore: 0.95,
          isVerified: true,
          status: 'active' as const,
          rawSource: { ...rawEvent, _location: location },
        };

        const dedupCandidate: IncomingEventForDedup = {
          externalId: eventToInsert.externalId,
          sourceType: eventToInsert.sourceType,
          title: eventToInsert.title,
          venueName: eventToInsert.venueName,
          lat: eventToInsert.lat,
          lng: eventToInsert.lng,
          startAt: eventToInsert.startAt,
          ticketUrl: eventToInsert.ticketUrl,
          platform: eventToInsert.platform,
          priceMin: eventToInsert.priceMin,
          priceMax: eventToInsert.priceMax,
          isFree: eventToInsert.isFree,
        };

        // Upsert using onConflict for same-source; dedup check for new events
        const existingRow = await db
          .select({ id: events.id })
          .from(events)
          .where(
            // NYC Parks events don't have a simple externalId unique key issue,
            // but we use onConflict to handle re-syncs of the same event_id
            eq(events.externalId, eventToInsert.externalId)
          )
          .limit(1);

        if (existingRow.length > 0) {
          await db
            .insert(events)
            .values({ ...eventToInsert, ticketUrls: buildInitialTicketUrls(dedupCandidate) })
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
                priceMin: eventToInsert.priceMin,
                ticketUrl: eventToInsert.ticketUrl,
                status: eventToInsert.status,
                updatedAt: new Date(),
              },
            });
        } else {
          // Cross-platform dedup check for new events
          const dedupResult = await findCanonicalMatch(dedupCandidate);

          if (dedupResult.isMatch && dedupResult.canonicalEventId) {
            const { confidenceScore: _cs, rawSource: _rs, isVerified: _iv, ...coreFields } = eventToInsert;
            await mergeIntoCanonical(
              dedupResult.canonicalEventId,
              dedupCandidate,
              coreFields,
              dedupResult.shouldUpdateCanonical
            );
          } else {
            await db
              .insert(events)
              .values({ ...eventToInsert, ticketUrls: buildInitialTicketUrls(dedupCandidate) })
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
                  priceMin: eventToInsert.priceMin,
                  ticketUrl: eventToInsert.ticketUrl,
                  status: eventToInsert.status,
                  updatedAt: new Date(),
                },
              });
          }
        }

        eventsUpserted++;
      } catch (err) {
        console.error(`[NYC Parks] Failed to process event ${rawEvent.event_id}:`, err);
        errorsCount++;
      }
    }

    // Step 4: Update ingestion tracking (upsert)
    const existing = await db
      .select()
      .from(ingestionSources)
      .where(eq(ingestionSources.type, 'nyc_parks_api'))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(ingestionSources)
        .set({
          lastSyncedAt: new Date(),
          syncStatus: 'active',
          errorMessage: null,
        })
        .where(eq(ingestionSources.type, 'nyc_parks_api'));
    } else {
      await db
        .insert(ingestionSources)
        .values({
          type: 'nyc_parks_api',
          syncStatus: 'active',
          lastSyncedAt: new Date(),
          config: {},
        });
    }

    console.log(`[NYC Parks Ingestion] Complete: upserted=${eventsUpserted}, skipped=${eventsSkipped}, errors=${errorsCount}`);
  } catch (error) {
    console.error('[NYC Parks Ingestion] Sync failed:', error);
    const existingErr = await db
      .select()
      .from(ingestionSources)
      .where(eq(ingestionSources.type, 'nyc_parks_api'))
      .limit(1);

    if (existingErr.length > 0) {
      await db
        .update(ingestionSources)
        .set({
          syncStatus: 'error',
          errorMessage: String(error),
        })
        .where(eq(ingestionSources.type, 'nyc_parks_api'));
    } else {
      await db
        .insert(ingestionSources)
        .values({
          type: 'nyc_parks_api',
          syncStatus: 'error',
          errorMessage: String(error),
          config: {},
        });
    }

    throw error;
  }

  return {
    eventsUpserted,
    eventsSkipped,
    errors: errorsCount,
    durationMs: Date.now() - startTime,
  };
}

