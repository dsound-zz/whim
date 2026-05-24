import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const TICKETMASTER_API_URL = 'https://app.ticketmaster.com/discovery/v2';

async function fetchTicketmaster(endpoint: string, apiKey: string) {
  const url = new URL(`${TICKETMASTER_API_URL}${endpoint}`);
  url.searchParams.append('apikey', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Ticketmaster API error: ${response.statusText}`);
  }
  return response.json();
}

export async function ingestTicketmasterEvents(apiKey: string | undefined, city = 'New York') {
  if (!apiKey) {
    throw new Error('TicketMaster API Key is required.');
  }

  const searchUrl = `/events.json?city=${encodeURIComponent(city)}&size=50`;
  
  try {
    const data = await fetchTicketmaster(searchUrl, apiKey);
    if (!data._embedded || !data._embedded.events) {
      return { inserted: 0, updated: 0, errors: 0, message: 'No events found.' };
    }
    return processTicketmasterPayload(data._embedded.events);
  } catch (err) {
    console.error('Failed to fetch from Ticketmaster:', err);
    throw err;
  }
}

async function processTicketmasterPayload(tmEvents: any[]) {
  const results = { inserted: 0, updated: 0, errors: 0 };

  for (const tmEvent of tmEvents) {
    try {
      const venueData = tmEvent._embedded?.venues?.[0];
      const priceData = tmEvent.priceRanges?.[0];
      
      const eventToInsert = {
        externalId: tmEvent.id,
        sourceType: 'ticketmaster',
        title: tmEvent.name || 'Unknown Title',
        description: tmEvent.description || tmEvent.info || null,
        imageUrl: tmEvent.images?.[0]?.url || null,
        startAt: new Date(tmEvent.dates?.start?.dateTime || tmEvent.dates?.start?.localDate),
        endAt: null, // TicketMaster often doesn't provide end time
        venueName: venueData?.name || 'Unknown Venue',
        address: venueData ? `${venueData.address?.line1 || ''}, ${venueData.city?.name || ''}`.trim() : null,
        lat: venueData?.location?.latitude ? parseFloat(venueData.location.latitude) : null,
        lng: venueData?.location?.longitude ? parseFloat(venueData.location.longitude) : null,
        isFree: priceData?.min === 0 && priceData?.max === 0,
        priceMin: priceData?.min || null,
        priceMax: priceData?.max || null,
        currency: priceData?.currency || null,
        ticketUrl: tmEvent.url,
        platform: 'Ticketmaster',
        rawSource: tmEvent,
        status: tmEvent.dates?.status?.code === 'onsale' ? 'active' : (tmEvent.dates?.status?.code === 'cancelled' ? 'cancelled' : 'active'),
      };

      const existing = await db.select().from(events).where(
        and(eq(events.externalId, eventToInsert.externalId), eq(events.sourceType, 'ticketmaster'))
      );

      if (existing.length > 0) {
        await db.update(events).set(eventToInsert).where(eq(events.id, existing[0].id));
        results.updated++;
      } else {
        await db.insert(events).values(eventToInsert);
        results.inserted++;
      }
    } catch (e) {
      console.error('Failed to process Ticketmaster event:', tmEvent.id, e);
      results.errors++;
    }
  }

  return results;
}
