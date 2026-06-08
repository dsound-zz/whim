/**
 * Estimates an end time for events that don't provide one.
 *
 * Many upstream sources (Ticketmaster, Songkick, Dice, SeatGeek) never
 * include end times. Rather than leaving `endAt` null — which breaks
 * "happening now" filters and makes the UI less informative — we apply
 * category-based default durations derived from typical NYC event lengths.
 *
 * Sources that provide real end times (Eventbrite, NYC Parks, iCal) are
 * never overwritten — this utility is only called when `endAt` is null.
 */

import type { WhimCategory } from '@/lib/utils/categorizeEvent';

const CATEGORY_DURATION_HOURS: Record<string, number> = {
  music:      3.0,  // concerts, DJ sets, live shows
  comedy:     1.5,  // standup sets, improv shows
  theater:    2.5,  // Broadway standard (with intermission)
  art:        3.0,  // gallery openings, exhibition events
  film:       2.0,  // screenings
  nightlife:  4.0,  // club events, DJ nights, parties
  sports:     3.0,  // games, matches
  food_drink: 2.0,  // tastings, dinners, cocktail classes
  fitness:    1.5,  // classes, runs, yoga sessions
  family:     2.0,  // kids events, family activities
  community:  3.0,  // festivals, fairs, markets
  other:      2.5,  // safe middle ground
};

const DEFAULT_DURATION_HOURS = 2.5;

/**
 * Returns an estimated end time based on the event's category.
 * Only call this when the source does not provide a real end time.
 */
export function estimateEndTime(
  startAt: Date,
  category: WhimCategory | string | null
): Date {
  const durationHours = CATEGORY_DURATION_HOURS[category ?? 'other'] ?? DEFAULT_DURATION_HOURS;
  return new Date(startAt.getTime() + durationHours * 60 * 60 * 1000);
}
