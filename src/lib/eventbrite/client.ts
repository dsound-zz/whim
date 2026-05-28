import { db } from '@/db';
import { events, venues } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { validateEventDates } from '@/lib/utils/validateEventDates';
import { normalizeEventTitle } from '@/lib/utils/normalizeEventTitle';
import { classifyEventCategory } from '@/lib/utils/categorizeEvent';
import {
  findCanonicalMatch,
  mergeIntoCanonical,
  buildInitialTicketUrls,
  type IncomingEventForDedup,
} from '@/lib/utils/deduplicateAtIngestion';

const EVENTBRITE_API_URL = 'https://www.eventbriteapi.com/v3';

// Helper to fetch from Eventbrite
async function fetchEventbrite(endpoint: string, apiKey: string) {
  const url = `${EVENTBRITE_API_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Eventbrite API error: ${response.statusText}`);
  }
  return response.json();
}

export async function ingestEventbriteEvents(apiKey: string | undefined, city = 'New York') {
  if (!apiKey) {
    console.warn('No Eventbrite API key provided, returning mock data.');
    return ingestMockData();
  }

  // In a real implementation, we would query the destination/search API or a venue's events
  // For this MVP, let's assume we query by location:
  const searchUrl = `/events/search/?location.address=${encodeURIComponent(city)}&expand=venue`;
  
  try {
    const data = await fetchEventbrite(searchUrl, apiKey);
    return processEventbritePayload(data.events);
  } catch (err) {
    console.error('Failed to fetch from Eventbrite:', err);
    throw err;
  }
}

async function processEventbritePayload(eventbriteEvents: any[]) {
  const results = { inserted: 0, updated: 0, errors: 0, skipped: 0 };

  for (const ebEvent of eventbriteEvents) {
    try {
      const venueData = ebEvent.venue;

      const rawStartAt = new Date(ebEvent.start.utc);
      const rawEndAt = new Date(ebEvent.end.utc);
      const dateValidation = validateEventDates(rawStartAt, rawEndAt);
      if (!dateValidation.isValid) {
        console.warn(`[Eventbrite] Skipping event ${ebEvent.id}: ${dateValidation.rejectionReason}`);
        results.skipped++;
        continue;
      }

      const rawTitle = ebEvent.name?.text || 'Unknown Title';
      const normalizedTitle = normalizeEventTitle(rawTitle) ?? rawTitle;

      const ebriteCategory = ebEvent.category?.name;
      const ebriteFormat = ebEvent.format?.name;
      const category = await classifyEventCategory({
        title: normalizedTitle,
        description: ebEvent.description?.text,
        platformTaxonomy: { ebriteCategory, ebriteFormat },
      });

      const eventToInsert = {
        externalId: ebEvent.id,
        sourceType: 'eventbrite_api' as const,
        title: normalizedTitle,
        description: ebEvent.description?.text ?? null,
        category,
        imageUrl: ebEvent.logo?.url ?? null,
        startAt: rawStartAt,
        endAt: dateValidation.sanitizedEndAt,
        venueName: venueData?.name || 'Unknown Venue',
        address: venueData?.address?.localized_address_display || null,
        lat: venueData?.address?.latitude ? parseFloat(venueData.address.latitude) : null,
        lng: venueData?.address?.longitude ? parseFloat(venueData.address.longitude) : null,
        isFree: ebEvent.is_free,
        priceMin: null as number | null,
        priceMax: null as number | null,
        ticketUrl: ebEvent.url,
        platform: 'Eventbrite',
        confidenceScore: 0.9,
        rawSource: ebEvent,
        status: (ebEvent.status === 'live' ? 'active' : 'cancelled') as 'active' | 'cancelled',
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

      // Intra-source dedup
      const existing = await db.select().from(events).where(
        and(eq(events.externalId, eventToInsert.externalId), eq(events.sourceType, 'eventbrite_api'))
      );

      if (existing.length > 0) {
        await db.update(events).set({
          ...eventToInsert,
          ticketUrls: buildInitialTicketUrls(dedupCandidate),
        }).where(eq(events.id, existing[0].id));
        results.updated++;
      } else {
        // Cross-platform dedup check
        const dedupResult = await findCanonicalMatch(dedupCandidate);

        if (dedupResult.isMatch && dedupResult.canonicalEventId) {
          const { confidenceScore: _cs, rawSource: _rs, ...coreFields } = eventToInsert;
          await mergeIntoCanonical(
            dedupResult.canonicalEventId,
            dedupCandidate,
            coreFields,
            dedupResult.shouldUpdateCanonical
          );
          results.skipped++;
        } else {
          await db.insert(events).values({
            ...eventToInsert,
            ticketUrls: buildInitialTicketUrls(dedupCandidate),
          });
          results.inserted++;
        }
      }
    } catch (e) {
      console.error('Failed to process event:', ebEvent.id, e);
      results.errors++;
    }
  }

  return results;
}

async function ingestMockData() {
  console.log('Ingesting mock Eventbrite data for NYC...');
  const mockEvents = [
    {
      id: 'mock-1',
      name: { text: 'Brooklyn Indie Music Fest' },
      description: { text: 'A great local music festival in Brooklyn.' },
      start: { utc: new Date(Date.now() + 86400000).toISOString() },
      end: { utc: new Date(Date.now() + 90000000).toISOString() },
      venue: {
        name: 'Brooklyn Steel',
        address: { localized_address_display: '319 Frost St, Brooklyn, NY 11222', latitude: '40.7196', longitude: '-73.9387' }
      },
      logo: { url: 'https://picsum.photos/400/200' },
      is_free: false,
      url: 'https://eventbrite.com/mock-1',
      status: 'live'
    },
    {
      id: 'mock-2',
      name: { text: 'Tech Meetup NYC' },
      description: { text: 'Monthly gathering of software engineers.' },
      start: { utc: new Date(Date.now() + 172800000).toISOString() },
      end: { utc: new Date(Date.now() + 180000000).toISOString() },
      venue: {
        name: 'WeWork Chelsea',
        address: { localized_address_display: '115 W 18th St, New York, NY 10011', latitude: '40.7410', longitude: '-73.9984' }
      },
      logo: { url: 'https://picsum.photos/400/200' },
      is_free: true,
      url: 'https://eventbrite.com/mock-2',
      status: 'live'
    }
  ];

  return processEventbritePayload(mockEvents);
}
