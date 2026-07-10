/**
 * Target Dice venues for the per-venue crawl.
 *
 * Dice's NYC "browse" feed is popularity-ranked and only surfaces ~100 events from the
 * large/featured rooms, so the entire small-venue long tail is invisible to the browse
 * scraper. This list lets us crawl each venue's own Dice page directly.
 *
 * `slug` is the path segment in `https://dice.fm/venue/<slug>` (includes Dice's trailing id).
 * `displayName` is the canonical venue name written to the events table (forced, so we don't
 * rely on the venue name being present in each card on a single-venue page).
 */
export interface DiceVenueTarget {
  slug: string;
  displayName: string;
}

export const DICE_VENUE_TARGETS: DiceVenueTarget[] = [
  { slug: 'brooklyn-music-kitchen-rqyr', displayName: 'Brooklyn Music Kitchen' },
];
