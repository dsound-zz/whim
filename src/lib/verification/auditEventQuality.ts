/**
 * auditEventQuality.ts
 *
 * Core audit engine for the Data Quality system.
 * Runs a battery of checks against a single event and returns a structured
 * quality report with a composite score.
 *
 * Checks performed:
 *  1. Stale event — startAt in the past, still active
 *  2. Missing fields — null imageUrl, description, coords, category
 *  3. Coordinate accuracy — re-geocode via Mapbox, flag if delta > 500m
 *  4. Price sanity — priceMin > priceMax, negative values, absurd maximums
 *  5. Duplicate suspects — find similar events by title + venue + time
 */

import type { InferSelectModel } from 'drizzle-orm';
import type { events } from '@/db/schema';
import type { EventAuditResult } from '@/types/audit';
import { fetchDuplicateCandidates } from '@/lib/db/auditQueries';
import { geocodeWithMapbox } from '@/lib/utils/geocode';
import { calculateDistanceMiles } from '@/lib/utils/calculateDistance';
import { jaccardSimilarity, tokenize } from '@/lib/utils/venueMatching';

type EventRow = InferSelectModel<typeof events>;

// Coordinate mismatch threshold in meters
const COORD_DELTA_THRESHOLD_METERS = 500;

// Title similarity threshold for duplicate detection
const DUPLICATE_TITLE_SIMILARITY_THRESHOLD = 0.4;

// ─── Main Audit Function ─────────────────────────────────────────────────────

export async function auditEventQuality(
  event: EventRow
): Promise<EventAuditResult> {
  const now = new Date();

  // Run all checks
  const staleEvent = checkStaleEvent(event, now);
  const missingFields = checkMissingFields(event);
  const coordinateAccuracy = await checkCoordinateAccuracy(event);
  const priceSanity = checkPriceSanity(event);
  const duplicateSuspect = await checkDuplicates(event);

  // Compute composite score (0–100)
  const overallScore = computeQualityScore({
    staleEvent,
    missingFields,
    coordinateAccuracy,
    priceSanity,
    duplicateSuspect,
  });

  return {
    eventId: event.id,
    eventTitle: event.title,
    sourceType: event.sourceType,
    overallScore,
    checks: {
      staleEvent,
      missingFields,
      coordinateAccuracy,
      priceSanity,
      duplicateSuspect,
    },
    auditedAt: now,
  };
}

// ─── Check 1: Stale Event ────────────────────────────────────────────────────

function checkStaleEvent(
  event: EventRow,
  now: Date
): { passed: boolean; detail: string } {
  if (event.status !== 'active') {
    return { passed: true, detail: `Status is '${event.status}', not active.` };
  }

  const endTime = event.endAt ?? event.startAt;
  if (endTime < now) {
    const hoursAgo = Math.round(
      (now.getTime() - endTime.getTime()) / (1000 * 60 * 60)
    );
    return {
      passed: false,
      detail: `Event ended ${hoursAgo} hours ago but is still active.`,
    };
  }

  return { passed: true, detail: 'Event is still upcoming.' };
}

// ─── Check 2: Missing Fields ─────────────────────────────────────────────────

function checkMissingFields(
  event: EventRow
): { passed: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  if (!event.imageUrl) missingFields.push('imageUrl');
  if (!event.description) missingFields.push('description');
  if (event.lat == null || event.lng == null) missingFields.push('coordinates');
  if (!event.category || event.category === 'other') {
    missingFields.push('category');
  }

  return {
    passed: missingFields.length === 0,
    missingFields,
  };
}

// ─── Check 3: Coordinate Accuracy ────────────────────────────────────────────

async function checkCoordinateAccuracy(
  event: EventRow
): Promise<{
  passed: boolean;
  deltaMeters: number | null;
  suggestedLat: number | null;
  suggestedLng: number | null;
}> {
  // Skip if the event has no coordinates to compare
  if (event.lat == null || event.lng == null) {
    return { passed: true, deltaMeters: null, suggestedLat: null, suggestedLng: null };
  }

  // Skip if no venue name or address to geocode
  if (!event.venueName && !event.address) {
    return { passed: true, deltaMeters: null, suggestedLat: null, suggestedLng: null };
  }

  try {
    const geocodeResult = await geocodeWithMapbox(
      event.venueName ?? '',
      event.address ?? '',
      { types: 'poi,address', skipVenueDbLookup: true }
    );

    if (!geocodeResult) {
      // Mapbox returned no results — can't verify, treat as passed
      return { passed: true, deltaMeters: null, suggestedLat: null, suggestedLng: null };
    }

    // Calculate distance in meters
    const distanceMiles = calculateDistanceMiles(
      event.lat,
      event.lng,
      geocodeResult.lat,
      geocodeResult.lng
    );
    const deltaMeters = Math.round(distanceMiles * 1609.34);

    const isPassed = deltaMeters <= COORD_DELTA_THRESHOLD_METERS;

    return {
      passed: isPassed,
      deltaMeters,
      suggestedLat: isPassed ? null : geocodeResult.lat,
      suggestedLng: isPassed ? null : geocodeResult.lng,
    };
  } catch (error) {
    console.error(`[Audit] Geocode failed for event ${event.id}:`, error);
    return { passed: true, deltaMeters: null, suggestedLat: null, suggestedLng: null };
  }
}

// ─── Check 4: Price Sanity ───────────────────────────────────────────────────

function checkPriceSanity(
  event: EventRow
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  if (event.priceMin != null && event.priceMin < 0) {
    issues.push(`Negative priceMin: $${event.priceMin}`);
  }

  if (event.priceMax != null && event.priceMax < 0) {
    issues.push(`Negative priceMax: $${event.priceMax}`);
  }

  if (
    event.priceMin != null &&
    event.priceMax != null &&
    event.priceMin > event.priceMax
  ) {
    issues.push(
      `priceMin ($${event.priceMin}) exceeds priceMax ($${event.priceMax})`
    );
  }

  if (event.priceMax != null && event.priceMax > 10000) {
    issues.push(`Suspiciously high priceMax: $${event.priceMax}`);
  }

  if (event.isFree && event.priceMin != null && event.priceMin > 0) {
    issues.push(
      `Marked as free but priceMin is $${event.priceMin}`
    );
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

// ─── Check 5: Duplicate Detection ───────────────────────────────────────────

async function checkDuplicates(
  event: EventRow
): Promise<{
  passed: boolean;
  suspectedDuplicateIds: string[];
  matchDetails: Array<{
    eventId: string;
    title: string;
    venueName: string | null;
    sourceType: string;
    similarityScore: number;
  }>;
}> {
  if (!event.startAt) {
    return { passed: true, suspectedDuplicateIds: [], matchDetails: [] };
  }

  try {
    const candidates = await fetchDuplicateCandidates(
      event.id,
      event.title,
      event.lat,
      event.lng,
      event.startAt,
      20
    );

    const eventTitleTokens = tokenize(event.title);
    const matchDetails: Array<{
      eventId: string;
      title: string;
      venueName: string | null;
      sourceType: string;
      similarityScore: number;
    }> = [];

    for (const candidate of candidates) {
      const candidateTitleTokens = tokenize(candidate.title);
      const titleSimilarity = jaccardSimilarity(
        eventTitleTokens,
        candidateTitleTokens
      );

      if (titleSimilarity >= DUPLICATE_TITLE_SIMILARITY_THRESHOLD) {
        matchDetails.push({
          eventId: candidate.id,
          title: candidate.title,
          venueName: candidate.venueName,
          sourceType: candidate.sourceType,
          similarityScore: Math.round(titleSimilarity * 100) / 100,
        });
      }
    }

    return {
      passed: matchDetails.length === 0,
      suspectedDuplicateIds: matchDetails.map((m) => m.eventId),
      matchDetails,
    };
  } catch (error) {
    console.error(`[Audit] Duplicate check failed for event ${event.id}:`, error);
    return { passed: true, suspectedDuplicateIds: [], matchDetails: [] };
  }
}

// ─── Composite Score ─────────────────────────────────────────────────────────

/**
 * Computes a 0–100 composite quality score.
 *
 * Weights:
 *  - Not stale:      20 points
 *  - Complete data:   30 points (proportional to non-missing fields)
 *  - Good coords:     25 points
 *  - Price valid:     10 points
 *  - No duplicates:   15 points
 */
function computeQualityScore(checks: EventAuditResult['checks']): number {
  let score = 0;

  // Stale check: 20 points
  if (checks.staleEvent.passed) score += 20;

  // Missing fields: 30 points (proportional)
  const totalCriticalFields = 4; // imageUrl, description, coordinates, category
  const presentFields = totalCriticalFields - checks.missingFields.missingFields.length;
  score += Math.round((presentFields / totalCriticalFields) * 30);

  // Coordinate accuracy: 25 points
  if (checks.coordinateAccuracy.passed) score += 25;

  // Price sanity: 10 points
  if (checks.priceSanity.passed) score += 10;

  // Duplicate check: 15 points
  if (checks.duplicateSuspect.passed) score += 15;

  return score;
}
