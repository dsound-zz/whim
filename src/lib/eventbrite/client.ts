import { db } from '@/db';
import { events, venues } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

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
  const results = { inserted: 0, updated: 0, errors: 0 };

  for (const ebEvent of eventbriteEvents) {
    try {
      // Create or update venue (mocking venue id mapping for now)
      // In production we'd look up googlePlaceId
      const venueData = ebEvent.venue;
      
      const eventToInsert = {
        externalId: ebEvent.id,
        sourceType: 'eventbrite',
        title: ebEvent.name?.text || 'Unknown Title',
        description: ebEvent.description?.text,
        imageUrl: ebEvent.logo?.url,
        startAt: new Date(ebEvent.start.utc),
        endAt: new Date(ebEvent.end.utc),
        venueName: venueData?.name || 'Unknown Venue',
        address: venueData?.address?.localized_address_display || null,
        lat: venueData?.address?.latitude ? parseFloat(venueData.address.latitude) : null,
        lng: venueData?.address?.longitude ? parseFloat(venueData.address.longitude) : null,
        isFree: ebEvent.is_free,
        ticketUrl: ebEvent.url,
        platform: 'Eventbrite',
        rawSource: ebEvent,
        status: ebEvent.status === 'live' ? 'active' : 'cancelled',
      };

      // Upsert logic (simple for MVP)
      const existing = await db.select().from(events).where(
        and(eq(events.externalId, eventToInsert.externalId), eq(events.sourceType, 'eventbrite'))
      );

      if (existing.length > 0) {
        await db.update(events).set(eventToInsert).where(eq(events.id, existing[0].id));
        results.updated++;
      } else {
        await db.insert(events).values(eventToInsert);
        results.inserted++;
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
