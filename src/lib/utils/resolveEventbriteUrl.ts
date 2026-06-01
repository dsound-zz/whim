/**
 * Extracts the numeric Organizer ID from a standard Eventbrite URL.
 * Handles both Organizer URLs (/o/) and Event URLs (/e/).
 * Example Organizer: https://www.eventbrite.com/o/brooklyn-music-kitchen-123456 -> 123456
 * Example Event: https://www.eventbrite.com/e/rare-dm-tickets-1049969018447 -> fetches organizer from API
 */
export async function extractEventbriteId(input: string, apiKey: string): Promise<string | null> {
  const trimmed = input.trim();
  
  // If it's just digits, assume it's already an ID
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  // 1. Try to match an Organizer URL pattern (matches the last string of digits before ? or / or end)
  const orgMatch = trimmed.match(/\/o\/.*?(\d+)(?:\?|\/|$)/i);
  if (orgMatch && orgMatch[1]) {
    return orgMatch[1];
  }

  // 2. Try to match an Event URL pattern and fetch from API
  const eventMatch = trimmed.match(/\/e\/.*?(\d+)(?:\?|\/|$)/i);
  if (eventMatch && eventMatch[1]) {
    const eventId = eventMatch[1];
    try {
      const res = await fetch(`https://www.eventbriteapi.com/v3/events/${eventId}/`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!res.ok) {
        console.error(`Failed to fetch event ${eventId} from Eventbrite API: ${res.statusText}`);
        return null;
      }
      const data = await res.json();
      if (data.organizer_id) {
        return data.organizer_id;
      }
    } catch (e) {
      console.error("Error fetching event details for resolver:", e);
      return null;
    }
  }

  return null;
}
