/**
 * Validates event date fields for sanity before ingestion.
 *
 * Guards against:
 * - Unix epoch dates (1970-01-01) from failed/empty date string parsing
 * - Events more than 2 years in the future (likely data entry errors)
 * - Events that already started more than 24 hours ago (not worth ingesting)
 * - endAt set before startAt (corrupted data)
 */

export interface DateValidationResult {
  isValid: boolean;
  /** A sanitized endAt, or null if the original was invalid */
  sanitizedEndAt: Date | null;
  /** Human-readable reason for rejection, if isValid is false */
  rejectionReason?: string;
}

const UNIX_EPOCH = new Date('1970-01-01T00:00:00.000Z');
const EPOCH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 1 day past epoch = likely bad parse
const MAX_FUTURE_YEARS = 2;
const PAST_CUTOFF_HOURS = 24;

export function validateEventDates(
  startAt: Date,
  endAt: Date | null | undefined
): DateValidationResult {
  const now = new Date();

  // Guard: startAt must be a real Date object
  if (!(startAt instanceof Date) || isNaN(startAt.getTime())) {
    return {
      isValid: false,
      sanitizedEndAt: null,
      rejectionReason: 'startAt is not a valid Date object',
    };
  }

  // Guard: reject Unix epoch dates (failed string parse)
  if (startAt.getTime() - UNIX_EPOCH.getTime() < EPOCH_THRESHOLD_MS) {
    return {
      isValid: false,
      sanitizedEndAt: null,
      rejectionReason: `startAt resolves to Unix epoch (${startAt.toISOString()}) — likely a failed date parse`,
    };
  }

  // Guard: reject events already ended more than 24 hours ago
  const pastCutoff = new Date(now.getTime() - PAST_CUTOFF_HOURS * 60 * 60 * 1000);
  if (startAt < pastCutoff) {
    return {
      isValid: false,
      sanitizedEndAt: null,
      rejectionReason: `startAt (${startAt.toISOString()}) is more than ${PAST_CUTOFF_HOURS} hours in the past`,
    };
  }

  // Guard: reject events too far in the future
  const maxFutureDate = new Date(now);
  maxFutureDate.setFullYear(now.getFullYear() + MAX_FUTURE_YEARS);
  if (startAt > maxFutureDate) {
    return {
      isValid: false,
      sanitizedEndAt: null,
      rejectionReason: `startAt (${startAt.toISOString()}) is more than ${MAX_FUTURE_YEARS} years in the future`,
    };
  }

  // Sanitize endAt: if it's before startAt, null it out rather than storing invalid data
  let sanitizedEndAt: Date | null = endAt ?? null;
  if (sanitizedEndAt !== null) {
    if (isNaN(sanitizedEndAt.getTime())) {
      sanitizedEndAt = null;
    } else if (sanitizedEndAt <= startAt) {
      console.warn(
        `[DateValidation] endAt (${sanitizedEndAt.toISOString()}) is before or equal to startAt (${startAt.toISOString()}). Setting endAt to null.`
      );
      sanitizedEndAt = null;
    }
  }

  return {
    isValid: true,
    sanitizedEndAt,
  };
}
