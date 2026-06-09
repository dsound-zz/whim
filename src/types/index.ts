export interface FetchEventsParams {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  startDate?: Date;
  endDate?: Date;
  timeframe?: 'tonight' | 'next_2_days' | 'this_week';
  category?: string;
  search?: string;
  limit: number;
  offset: number;
}

/**
 * The event shape returned by fetchEventsNearLocation() and the /api/feed/events
 * endpoint. Used by the consumer feed page, FeedMapUI, EventCard, and EventDrawer.
 * Replaces the `any[]` that was previously threaded through the feed stack.
 */
export interface FeedEvent {
  id: string;
  title: string;
  venueName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  startAt: Date | string;
  endAt: Date | string | null;
  isFree: boolean | null;
  priceMin: number | null;
  priceMax: number | null;
  ticketUrl: string | null;
  sourceType: string;
  category: string | null;
  status: string | null;
  isVerified: boolean | null;
  imageUrl: string | null;
  description: string | null;
  confidenceScore: number | null;
  /** Number of additional future occurrences (recurring shows). */
  futureOccurrenceCount?: number;
}

/**
 * The event shape used throughout the admin dashboard.
 * Extends FeedEvent with admin-only fields (moreDates, verification status).
 * Canonical definition — re-exported from admin/events/types.ts as a shim.
 */
export interface AdminEvent {
  id: string;
  title: string;
  venueName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  startAt: Date;
  endAt: Date | null;
  isFree: boolean | null;
  priceMin: number | null;
  priceMax: number | null;
  ticketUrl: string | null;
  sourceType: string;
  category: string | null;
  status: string | null;
  isVerified: boolean | null;
  imageUrl: string | null;
  description: string | null;
  confidenceScore: number | null;
  /** Additional recurring date occurrences beyond the first. */
  moreDates?: number;
  /** Latest integrity check status from event_verification_logs. */
  verificationStatus: string | null;
  /** Delta in metres from last coordinate verification. */
  coordDeltaMeters: number | null;
}

export * from './submission';
export * from './audit';
export type { VerificationStatus } from './verification';
