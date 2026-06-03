'use server';

import {
  fetchVerificationLogs,
  fetchVerificationStats,
} from '@/lib/db/verificationService';
import { verifyEventIntegrity } from '@/lib/verification/verifyEventIntegrity';
import { saveVerificationLog } from '@/lib/db/verificationService';
import { db } from '@/db';
import { events, eventVerificationLogs } from '@/db/schema';
import { eq, gt, and, count, desc, or } from 'drizzle-orm';
import type { VerificationLog, VerificationStats, VerificationStatus } from '@/types/verification';
import type {
  DataQualityOverview,
  StaleEventRow,
  IncompleteEventRow,
} from '@/types/audit';
import {
  fetchDataQualityOverview,
  fetchStaleActiveEvents,
  fetchEventsWithMissingData,
  bulkUpdateEventStatus,
  acceptCoordinateCorrection,
} from '@/lib/db/auditQueries';

export async function fetchVerificationLogsAction(
  statusFilter?: VerificationStatus | 'all',
  limit = 200
): Promise<VerificationLog[]> {
  try {
    return await fetchVerificationLogs({ statusFilter, limit });
  } catch (error) {
    console.error('[VerificationAction] Failed to fetch logs:', error);
    return [];
  }
}

export async function fetchVerificationStatsAction(): Promise<VerificationStats> {
  try {
    return await fetchVerificationStats();
  } catch (error) {
    console.error('[VerificationAction] Failed to fetch stats:', error);
    return {
      totalChecked: 0,
      verified: 0,
      flaggedContent: 0,
      flaggedCoordinates: 0,
      flaggedBoth: 0,
      skipped: 0,
      errors: 0,
      lastCheckedAt: null,
    };
  }
}

export interface RunVerificationActionResult {
  checkedCount: number;
  verified: number;
  flagged: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

/**
 * Triggers a live integrity check run directly from the admin UI.
 * Runs synchronously (within the request) so the UI can display results immediately.
 * Limit is intentionally low (default 10) to keep the response time reasonable.
 */
export async function runVerificationAction(
  limit = 10,
  sourceTypeFilter?: string
): Promise<RunVerificationActionResult> {
  const startTime = Date.now();
  const now = new Date();

  const whereConditions = [
    eq(events.status, 'active'),
    gt(events.startAt, now),
  ];

  if (sourceTypeFilter) {
    whereConditions.push(eq(events.sourceType, sourceTypeFilter as any));
  }

  const candidateEvents = await db
    .select({
      id: events.id,
      title: events.title,
      startAt: events.startAt,
      venueName: events.venueName,
      address: events.address,
      lat: events.lat,
      lng: events.lng,
      ticketUrl: events.ticketUrl,
      sourceType: events.sourceType,
    })
    .from(events)
    .where(and(...whereConditions))
    .orderBy(events.startAt)
    .limit(limit);

  let countVerified = 0;
  let countFlagged = 0;
  let countSkipped = 0;
  let countErrors = 0;

  for (const candidateEvent of candidateEvents) {
    const verificationResult = await verifyEventIntegrity({
      id: candidateEvent.id,
      title: candidateEvent.title,
      startAt: candidateEvent.startAt,
      venueName: candidateEvent.venueName,
      address: candidateEvent.address,
      lat: candidateEvent.lat,
      lng: candidateEvent.lng,
      ticketUrl: candidateEvent.ticketUrl,
      sourceType: candidateEvent.sourceType,
    });

    await saveVerificationLog(verificationResult);

    switch (verificationResult.status) {
      case 'verified': countVerified++; break;
      case 'skipped': countSkipped++; break;
      case 'error': countErrors++; break;
      default: countFlagged++;
    }

    // Brief throttle even in manual runs to avoid hammering external APIs.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return {
    checkedCount: candidateEvents.length,
    verified: countVerified,
    flagged: countFlagged,
    skipped: countSkipped,
    errors: countErrors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Deletes all rows from event_verification_logs.
 * Returns the number of rows that were removed so the UI can confirm what was cleared.
 */
export async function clearVerificationLogsAction(): Promise<{ deletedCount: number }> {
  const countResult = await db.select({ total: count() }).from(eventVerificationLogs);
  const deletedCount = Number(countResult[0]?.total ?? 0);

  await db.delete(eventVerificationLogs);

  return { deletedCount };
}

// ─── Data Quality Audit Actions ───────────────────────────────────────────────

/**
 * Fetches the top-level Data Quality Overview for the Overview tab.
 */
export async function fetchOverviewAction(): Promise<DataQualityOverview> {
  try {
    return await fetchDataQualityOverview();
  } catch (error) {
    console.error('[AuditAction] Failed to fetch overview:', error);
    return {
      totalActiveEvents: 0,
      staleEventCount: 0,
      missingImageCount: 0,
      missingDescriptionCount: 0,
      missingCoordsCount: 0,
      duplicateSuspectCount: 0,
      averageQualityScore: null,
      sourceBreakdown: [],
    };
  }
}

/**
 * Fetches active events whose start (and end) dates have already passed.
 */
export async function fetchStaleEventsAction(): Promise<StaleEventRow[]> {
  try {
    return await fetchStaleActiveEvents();
  } catch (error) {
    console.error('[AuditAction] Failed to fetch stale events:', error);
    return [];
  }
}

/**
 * Fetches active events with missing critical fields, filterable by field type.
 */
export async function fetchMissingDataAction(
  filter: string
): Promise<IncompleteEventRow[]> {
  try {
    const validFilters = ['all', 'image', 'description', 'coords', 'category'] as const;
    const sanitizedFilter = validFilters.includes(filter as typeof validFilters[number])
      ? (filter as typeof validFilters[number])
      : 'all';
    return await fetchEventsWithMissingData(sanitizedFilter);
  } catch (error) {
    console.error('[AuditAction] Failed to fetch missing data:', error);
    return [];
  }
}

/**
 * Marks a list of stale events as expired.
 */
export async function expireStaleEventsAction(
  eventIds: string[]
): Promise<{ expiredCount: number }> {
  try {
    const expiredCount = await bulkUpdateEventStatus(eventIds, 'expired');
    return { expiredCount };
  } catch (error) {
    console.error('[AuditAction] Failed to expire events:', error);
    return { expiredCount: 0 };
  }
}

/**
 * Accepts a coordinate correction from verification, overwriting the event's lat/lng.
 */
export async function acceptCorrectionAction(
  eventId: string,
  lat: number,
  lng: number
): Promise<void> {
  try {
    await acceptCoordinateCorrection(eventId, lat, lng);
  } catch (error) {
    console.error('[AuditAction] Failed to accept correction:', error);
    throw new Error('Failed to accept coordinate correction');
  }
}

/** Extended verification log type that includes mapbox coordinates for the coord audit tab. */
export interface CoordFlaggedLog {
  id: string;
  eventId: string;
  eventTitle: string;
  eventVenueName: string | null;
  checkedAt: Date;
  status: VerificationStatus;
  coordDeltaMeters: number | null;
  storedLat: number | null;
  storedLng: number | null;
  mapboxLat: number | null;
  mapboxLng: number | null;
  mismatchReason: string | null;
}

/**
 * Fetches verification logs with coordinate flags, including the mapbox suggested coords.
 */
export async function fetchCoordFlaggedLogsAction(): Promise<CoordFlaggedLog[]> {
  try {
    const rows = await db
      .select({
        id: eventVerificationLogs.id,
        eventId: eventVerificationLogs.eventId,
        eventTitle: events.title,
        eventVenueName: events.venueName,
        checkedAt: eventVerificationLogs.checkedAt,
        status: eventVerificationLogs.status,
        coordDeltaMeters: eventVerificationLogs.coordDeltaMeters,
        storedLat: eventVerificationLogs.storedLat,
        storedLng: eventVerificationLogs.storedLng,
        mapboxLat: eventVerificationLogs.mapboxLat,
        mapboxLng: eventVerificationLogs.mapboxLng,
        mismatchReason: eventVerificationLogs.mismatchReason,
      })
      .from(eventVerificationLogs)
      .innerJoin(events, eq(eventVerificationLogs.eventId, events.id))
      .where(
        or(
          eq(eventVerificationLogs.status, 'flagged_coordinates'),
          eq(eventVerificationLogs.status, 'flagged_both')
        )
      )
      .orderBy(desc(eventVerificationLogs.checkedAt))
      .limit(200);

    return rows as CoordFlaggedLog[];
  } catch (error) {
    console.error('[AuditAction] Failed to fetch coord flagged logs:', error);
    return [];
  }
}

// ─── Quick Audit (in-dashboard) ───────────────────────────────────────────────

export interface QuickAuditResult {
  scannedCount: number;
  staleFound: number;
  staleExpired: number;
  missingImageCount: number;
  missingDescriptionCount: number;
  missingCoordsCount: number;
  priceIssueCount: number;
  durationMs: number;
  updatedOverview: DataQualityOverview;
}

/**
 * Runs a fast, synchronous data quality scan directly from the admin UI.
 *
 * Deliberately skips slow checks (Mapbox re-geocoding, duplicate scanning)
 * so it completes in well under a second for typical batch sizes.
 *
 * What it checks:
 *  - Stale events (past end date, still active) → auto-expires them
 *  - Missing critical fields (imageUrl, description, coordinates)
 *  - Price sanity (priceMin > priceMax, negatives, free flag mismatch)
 *
 * Returns a summary + refreshed DataQualityOverview so the UI can update
 * stats cards without a page reload.
 */
export async function runQuickAuditAction(
  limit = 500
): Promise<QuickAuditResult> {
  const startTime = Date.now();

  // 1. Find and auto-expire stale events
  const staleEvents = await fetchStaleActiveEvents(limit);
  let staleExpired = 0;
  if (staleEvents.length > 0) {
    const staleIds = staleEvents.map((e) => e.id);
    staleExpired = await bulkUpdateEventStatus(staleIds, 'expired');
  }

  // 2. Scan active events for missing fields & price issues
  const activeEvents = await db
    .select({
      id: events.id,
      imageUrl: events.imageUrl,
      description: events.description,
      lat: events.lat,
      lng: events.lng,
      priceMin: events.priceMin,
      priceMax: events.priceMax,
      isFree: events.isFree,
    })
    .from(events)
    .where(eq(events.status, 'active'))
    .limit(limit);

  let missingImageCount = 0;
  let missingDescriptionCount = 0;
  let missingCoordsCount = 0;
  let priceIssueCount = 0;

  for (const event of activeEvents) {
    if (!event.imageUrl) missingImageCount++;
    if (!event.description) missingDescriptionCount++;
    if (event.lat == null || event.lng == null) missingCoordsCount++;

    const hasNegativeMin = event.priceMin != null && event.priceMin < 0;
    const hasNegativeMax = event.priceMax != null && event.priceMax < 0;
    const hasInvertedRange =
      event.priceMin != null &&
      event.priceMax != null &&
      event.priceMin > event.priceMax;
    const hasFreeConflict =
      event.isFree === true &&
      event.priceMin != null &&
      event.priceMin > 0;

    if (hasNegativeMin || hasNegativeMax || hasInvertedRange || hasFreeConflict) {
      priceIssueCount++;
    }
  }

  // 3. Fetch refreshed overview so the UI can update stats cards
  const updatedOverview = await fetchDataQualityOverview();

  return {
    scannedCount: activeEvents.length,
    staleFound: staleEvents.length,
    staleExpired,
    missingImageCount,
    missingDescriptionCount,
    missingCoordsCount,
    priceIssueCount,
    durationMs: Date.now() - startTime,
    updatedOverview,
  };
}
