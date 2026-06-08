import {
  normalizeForComparison,
  areVenuesSimilar,
} from '@/lib/utils/venueMatching';

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
  /** Total number of future occurrences for this show (including this one). 1 = one-off event. */
  futureOccurrenceCount: number;
  /** The next few dates after the representative occurrence (up to 3). Empty for one-off events. */
  nextOccurrenceDates: Date[];
}

function areTimesClose(timeA: Date, timeB: Date): boolean {
  const diffMs = Math.abs(new Date(timeA).getTime() - new Date(timeB).getTime());
  return diffMs <= 2 * 60 * 60 * 1000; // 2 hours
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
        normalizeForComparison(group.title) === normalizeForComparison(event.title) ||
        normalizeForComparison(group.title).includes(normalizeForComparison(event.title)) ||
        normalizeForComparison(event.title).includes(normalizeForComparison(group.title));
      
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

// ─── Recurring-show collapsing ──────────────────────────────────────────────

/**
 * Strips parenthetical city/location suffixes from titles for grouping.
 * E.g. "Hamilton (NY)" → "Hamilton", "Hamilton (New York)" → "Hamilton"
 * But preserves meaningful parentheticals like "Cats: The Jellicle Ball".
 */
function normalizeShowTitle(title: string): string {
  return normalizeForComparison(
    title.replace(/\s*\((?:ny|new york|nyc|brooklyn|queens|bronx|manhattan)\)\s*$/i, '')
  );
}

/**
 * Collapses recurring shows into a single representative event.
 *
 * After cross-platform dedup, many events remain that are the same show
 * on different dates (e.g., 257 rows of "Cats: The Jellicle Ball" for each
 * performance). This function groups by (title + venue) and keeps only the
 * **next upcoming occurrence**, attaching metadata about additional dates.
 *
 * This dramatically improves the feed's signal-to-noise ratio without
 * modifying the underlying database — all raw rows are preserved.
 */
export function collapseRecurringShows<T extends {
  id: string;
  title: string;
  startAt: Date;
  venueName: string | null;
  lat: number | null;
  lng: number | null;
  ticketSources: TicketSource[];
}>(inputEvents: T[]): (T & { futureOccurrenceCount: number; nextOccurrenceDates: Date[] })[] {
  const now = new Date();

  // Build groups keyed by normalized (title + venue)
  const groupMap = new Map<string, T[]>();

  for (const event of inputEvents) {
    const titleKey = normalizeShowTitle(event.title);
    const venueKey = normalizeForComparison(event.venueName);
    const groupKey = `${titleKey}::${venueKey}`;

    const existing = groupMap.get(groupKey);
    if (existing) {
      existing.push(event);
    } else {
      groupMap.set(groupKey, [event]);
    }
  }

  const result: (T & { futureOccurrenceCount: number; nextOccurrenceDates: Date[] })[] = [];

  for (const group of groupMap.values()) {
    if (group.length === 1) {
      // Single occurrence — pass through as-is
      result.push({
        ...group[0],
        futureOccurrenceCount: 1,
        nextOccurrenceDates: [],
      });
      continue;
    }

    // Sort by startAt ascending to find the next upcoming occurrence
    group.sort((eventA, eventB) => new Date(eventA.startAt).getTime() - new Date(eventB.startAt).getTime());

    // Find the earliest future event as the representative
    const futureEvents = group.filter((event) => new Date(event.startAt).getTime() >= now.getTime());
    const representative = futureEvents.length > 0 ? futureEvents[0] : group[group.length - 1];

    // Collect the next 3 dates after the representative
    const representativeTime = new Date(representative.startAt).getTime();
    const upcomingDates = futureEvents
      .filter((event) => new Date(event.startAt).getTime() > representativeTime)
      .slice(0, 3)
      .map((event) => new Date(event.startAt));

    result.push({
      ...representative,
      futureOccurrenceCount: futureEvents.length > 0 ? futureEvents.length : group.length,
      nextOccurrenceDates: upcomingDates,
    });
  }

  // Re-sort by the original ordering (startAt ascending)
  result.sort((eventA, eventB) => new Date(eventA.startAt).getTime() - new Date(eventB.startAt).getTime());

  return result;
}

