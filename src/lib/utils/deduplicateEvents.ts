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

const TIME_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

function areTimesClose(timeA: Date, timeB: Date): boolean {
  const diffMs = Math.abs(new Date(timeA).getTime() - new Date(timeB).getTime());
  return diffMs <= TIME_WINDOW_MS;
}

/**
 * Width of the time buckets used to index candidate groups in
 * `deduplicateEvents`. Any value ≤ TIME_WINDOW_MS is correct; smaller buckets
 * mean more buckets scanned but fewer groups compared in each.
 */
const BUCKET_MS = 60 * 60 * 1000; // 1 hour

function bucketIndexFor(time: Date | string): number {
  return Math.floor(new Date(time).getTime() / BUCKET_MS);
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
  type Group = T & { ticketSources: TicketSource[] };
  /** `order` preserves the original insertion sequence so the bucketed scan
   *  below picks the same group a linear `.find()` would have. */
  interface GroupEntry {
    order: number;
    group: Group;
  }

  const grouped: Group[] = [];

  // Groups indexed by the time bucket of their `startAt`. A group can only
  // match an event when their start times are within TIME_WINDOW_MS, so only
  // the buckets spanning that window need to be scanned — this is what keeps
  // the pass near-linear instead of comparing every event to every group.
  const bucketedGroups = new Map<number, GroupEntry[]>();
  let insertionOrder = 0;

  const indexGroup = (entry: GroupEntry): void => {
    const bucket = bucketIndexFor(entry.group.startAt);
    const existing = bucketedGroups.get(bucket);
    if (existing) existing.push(entry);
    else bucketedGroups.set(bucket, [entry]);
  };

  for (const event of inputEvents) {
    const eventTime = new Date(event.startAt).getTime();
    const firstBucket = Math.floor((eventTime - TIME_WINDOW_MS) / BUCKET_MS);
    const lastBucket = Math.floor((eventTime + TIME_WINDOW_MS) / BUCKET_MS);
    const normalizedEventTitle = normalizeForComparison(event.title);

    let matchedEntry: GroupEntry | undefined;

    for (let bucket = firstBucket; bucket <= lastBucket; bucket++) {
      const entries = bucketedGroups.get(bucket);
      if (!entries) continue;

      for (const entry of entries) {
        // Already holding an earlier-inserted match — this one can't win.
        if (matchedEntry && entry.order > matchedEntry.order) continue;

        const group = entry.group;
        if (!areTimesClose(group.startAt, event.startAt)) continue;

        const normalizedGroupTitle = normalizeForComparison(group.title);
        const titleMatch =
          normalizedGroupTitle === normalizedEventTitle ||
          normalizedGroupTitle.includes(normalizedEventTitle) ||
          normalizedEventTitle.includes(normalizedGroupTitle);
        if (!titleMatch) continue;

        const venueMatch = areVenuesSimilar(
          group.venueName,
          group.lat,
          group.lng,
          event.venueName,
          event.lat,
          event.lng
        );
        if (!venueMatch) continue;

        matchedEntry = entry;
      }
    }

    const matchedGroup = matchedEntry?.group;

    const currentSource: TicketSource = {
      platform: event.platform || "Unknown",
      ticketUrl: event.ticketUrl,
      priceMin: event.priceMin,
      priceMax: event.priceMax,
      isFree: event.isFree,
    };

    if (matchedGroup && matchedEntry) {
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
        const previousBucket = bucketIndexFor(matchedGroup.startAt);
        const ticketSources = matchedGroup.ticketSources;
        Object.assign(matchedGroup, event);
        matchedGroup.ticketSources = ticketSources;

        // Adopting the event's fields can move the group's startAt into a
        // different bucket; leaving it filed under the old one would hide it
        // from later events that should have matched it.
        const nextBucket = bucketIndexFor(matchedGroup.startAt);
        if (nextBucket !== previousBucket) {
          const previousEntries = bucketedGroups.get(previousBucket);
          if (previousEntries) {
            const position = previousEntries.indexOf(matchedEntry);
            if (position !== -1) previousEntries.splice(position, 1);
          }
          indexGroup(matchedEntry);
        }
      }
    } else {
      // Create new group
      const group: Group = {
        ...event,
        ticketSources: [currentSource],
      };
      grouped.push(group);
      indexGroup({ order: insertionOrder++, group });
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

