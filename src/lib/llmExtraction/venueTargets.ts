import type { WhimCategory } from '@/lib/utils/categorizeEvent';

/**
 * Curated list of venues whose events are LLM-extracted from their own site
 * rather than pulled from a platform API. Reserved for venues confirmed to
 * have no ticketing presence on any existing source (Ticketmaster, Dice,
 * Eventbrite, Songkick, RA, SeatGeek) — the long-tail case Whim's other
 * ingestors structurally cannot reach.
 */
export interface LlmExtractionVenueTarget {
  name: string;
  address: string;
  eventsPageUrl: string;
  /** Passed to classifyEventCategory as defaultCategory + skipLlmFallback,
   *  since the venue's category is already known (avoids a per-event LLM call). */
  defaultCategory: WhimCategory;
}

export const LLM_EXTRACTION_VENUE_TARGETS: LlmExtractionVenueTarget[] = [
  {
    name: 'Ornithology Jazz Club',
    address: '6 Suydam St, Brooklyn, NY 11221',
    eventsPageUrl: 'https://ornithologyjazzclub.com/brooklyn-bushwick-williamsburg-ornithology-jazz-club-events',
    defaultCategory: 'music',
  },
];
