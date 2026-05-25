export interface TicketSource {
  platform: string;
  ticketUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  isFree: boolean | null;
}

export interface GroupedEvent {
  id: string;
  title: string;
  description: string | null;
  category: "music" | "comedy" | "art" | "theater" | "food_drink" | "fitness" | "community" | "nightlife" | "family" | "sports" | "film" | "other" | null;
  imageUrl: string | null;
  startAt: Date;
  endAt: Date | null;
  venueName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  isFree: boolean | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  ticketUrl: string | null;
  platform: string | null;
  confidenceScore: number | null;
  isVerified: boolean | null;
  rawSource: any;
  createdAt: Date;
  updatedAt: Date;
  distanceMiles?: number;
  ticketSources: TicketSource[];
}

function normalizeString(str: string | null): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function areTimesClose(timeA: Date, timeB: Date): boolean {
  const diffMs = Math.abs(new Date(timeA).getTime() - new Date(timeB).getTime());
  return diffMs <= 2 * 60 * 60 * 1000; // 2 hours
}

function getDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Radius of the Earth in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function areVenuesSimilar(
  nameA: string | null,
  latA: number | null,
  lngA: number | null,
  nameB: string | null,
  latB: number | null,
  lngB: number | null
): boolean {
  const normA = normalizeString(nameA);
  const normB = normalizeString(nameB);
  
  if (normA && normB && (normA.includes(normB) || normB.includes(normA))) {
    return true;
  }

  if (latA !== null && lngA !== null && latB !== null && lngB !== null) {
    const dist = getDistanceMiles(latA, lngA, latB, lngB);
    return dist <= 0.1; // 0.1 miles (~160 meters)
  }

  return false;
}

export function deduplicateEvents<T extends {
  id: string;
  title: string;
  description: string | null;
  category: any;
  imageUrl: string | null;
  startAt: Date;
  endAt: Date | null;
  venueName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  isFree: boolean | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  ticketUrl: string | null;
  platform: string | null;
  confidenceScore: number | null;
  isVerified: boolean | null;
  rawSource: any;
  createdAt: Date;
  updatedAt: Date;
  distanceMiles?: number;
}>(inputEvents: T[]): (T & { ticketSources: TicketSource[] })[] {
  const grouped: (T & { ticketSources: TicketSource[] })[] = [];

  for (const event of inputEvents) {
    let matchedGroup = grouped.find((group) => {
      const sameTime = areTimesClose(group.startAt, event.startAt);
      const titleMatch =
        normalizeString(group.title) === normalizeString(event.title) ||
        normalizeString(group.title).includes(normalizeString(event.title)) ||
        normalizeString(event.title).includes(normalizeString(group.title));
      
      const venueMatch = areVenuesSimilar(
        group.venueName,
        group.lat,
        group.lng,
        event.venueName,
        event.lat,
        event.lng
      );

      return sameTime && titleMatch && venueMatch;
    });

    const currentSource: TicketSource = {
      platform: event.platform || "Unknown",
      ticketUrl: event.ticketUrl,
      priceMin: event.priceMin,
      priceMax: event.priceMax,
      isFree: event.isFree,
    };

    if (matchedGroup) {
      // Add ticket source if not already present in matched group
      const exists = matchedGroup.ticketSources.some(
        (src) => src.platform.toLowerCase() === currentSource.platform.toLowerCase()
      );
      if (!exists) {
        matchedGroup.ticketSources.push(currentSource);
      }

      // Merge and prefer higher confidence event representation
      const currentScore = event.confidenceScore ?? 1.0;
      const groupScore = matchedGroup.confidenceScore ?? 1.0;
      if (currentScore > groupScore) {
        // Update core info of group with higher confidence info
        const ticketSources = matchedGroup.ticketSources;
        Object.assign(matchedGroup, event);
        matchedGroup.ticketSources = ticketSources;
      }
    } else {
      // Create new group
      grouped.push({
        ...event,
        ticketSources: [currentSource],
      });
    }
  }

  return grouped;
}
