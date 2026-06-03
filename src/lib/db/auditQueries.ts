/**
 * auditQueries.ts
 *
 * Database queries powering the Data Quality Audit dashboard.
 * All reads are scoped to active events unless otherwise noted.
 * Consumed by:
 *  - src/app/admin/verification/actions.ts  (server actions)
 *  - src/lib/verification/auditEventQuality.ts (audit engine)
 *  - scripts/audit-data-quality.ts (batch cron)
 */

import { db } from '@/db';
import { events } from '@/db/schema';
import { eq, and, lt, isNull, or, sql, count, inArray, desc } from 'drizzle-orm';
import type {
  StaleEventRow,
  IncompleteEventRow,
  DataQualityOverview,
} from '@/types/audit';

// ─── Stale Events ────────────────────────────────────────────────────────────

/**
 * Finds active events whose startAt (and endAt, if present) have already passed.
 * These are events that should have been expired but weren't.
 */
export async function fetchStaleActiveEvents(
  limit = 200
): Promise<StaleEventRow[]> {
  const now = new Date();

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      venueName: events.venueName,
      sourceType: events.sourceType,
      startAt: events.startAt,
      endAt: events.endAt,
      status: events.status,
    })
    .from(events)
    .where(
      and(
        eq(events.status, 'active'),
        lt(events.startAt, now),
        // Only flag if endAt is also past (or null — meaning the event had no duration)
        or(isNull(events.endAt), lt(events.endAt, now))
      )
    )
    .orderBy(desc(events.startAt))
    .limit(limit);

  return rows as StaleEventRow[];
}

// ─── Missing Data ────────────────────────────────────────────────────────────

type MissingDataFilter = 'image' | 'description' | 'coords' | 'category' | 'all';

/**
 * Finds active events with missing critical fields.
 * Filterable by specific missing field or "all" (any field missing).
 */
export async function fetchEventsWithMissingData(
  filter: MissingDataFilter = 'all',
  limit = 200
): Promise<IncompleteEventRow[]> {
  const baseCondition = eq(events.status, 'active');

  let missingCondition;
  switch (filter) {
    case 'image':
      missingCondition = isNull(events.imageUrl);
      break;
    case 'description':
      missingCondition = isNull(events.description);
      break;
    case 'coords':
      missingCondition = or(isNull(events.lat), isNull(events.lng));
      break;
    case 'category':
      missingCondition = isNull(events.category);
      break;
    case 'all':
    default:
      missingCondition = or(
        isNull(events.imageUrl),
        isNull(events.description),
        or(isNull(events.lat), isNull(events.lng))
      );
      break;
  }

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      venueName: events.venueName,
      sourceType: events.sourceType,
      imageUrl: events.imageUrl,
      description: events.description,
      lat: events.lat,
      lng: events.lng,
      category: events.category,
    })
    .from(events)
    .where(and(baseCondition, missingCondition))
    .orderBy(events.title)
    .limit(limit);

  return rows as IncompleteEventRow[];
}

// ─── Duplicate Candidates ────────────────────────────────────────────────────

/**
 * For a given event, find other active events that might be duplicates.
 * Uses trigram similarity on title + venue proximity within 160m.
 * Returns raw candidate rows for the audit engine to score.
 */
export async function fetchDuplicateCandidates(
  eventId: string,
  eventTitle: string,
  eventLat: number | null,
  eventLng: number | null,
  eventStartAt: Date,
  limit = 10
) {
  // Window: ±4 hours from the event's startAt
  const windowStart = new Date(eventStartAt.getTime() - 4 * 60 * 60 * 1000);
  const windowEnd = new Date(eventStartAt.getTime() + 4 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      venueName: events.venueName,
      sourceType: events.sourceType,
      startAt: events.startAt,
      lat: events.lat,
      lng: events.lng,
      ticketUrl: events.ticketUrl,
      imageUrl: events.imageUrl,
    })
    .from(events)
    .where(
      and(
        eq(events.status, 'active'),
        sql`${events.id} != ${eventId}`,
        sql`${events.startAt} >= ${windowStart}`,
        sql`${events.startAt} <= ${windowEnd}`,
        sql`similarity(${events.title}, ${eventTitle}) > 0.3`
      )
    )
    .orderBy(sql`similarity(${events.title}, ${eventTitle}) DESC`)
    .limit(limit);

  return rows;
}

// ─── Bulk Operations ─────────────────────────────────────────────────────────

/**
 * Bulk-update status for a list of event IDs.
 * Used by "Expire All Stale" and "Merge Duplicates" actions.
 */
export async function bulkUpdateEventStatus(
  eventIds: string[],
  status: 'active' | 'cancelled' | 'expired' | 'draft'
): Promise<number> {
  if (eventIds.length === 0) return 0;

  const result = await db
    .update(events)
    .set({ status, updatedAt: new Date() })
    .where(inArray(events.id, eventIds));

  return eventIds.length;
}

/**
 * Update the confidence score for a single event.
 * Called by the audit engine after computing the composite quality score.
 */
export async function updateEventConfidenceScore(
  eventId: string,
  score: number
): Promise<void> {
  await db
    .update(events)
    .set({
      confidenceScore: Math.round(score * 100) / 100,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));
}

/**
 * Accept a coordinate correction from the audit.
 * Overwrites stored lat/lng with the re-geocoded values.
 */
export async function acceptCoordinateCorrection(
  eventId: string,
  correctedLat: number,
  correctedLng: number
): Promise<void> {
  await db
    .update(events)
    .set({
      lat: correctedLat,
      lng: correctedLng,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));
}

// ─── Overview Stats ──────────────────────────────────────────────────────────

/**
 * Computes the full Data Quality Overview for the dashboard.
 * Single query with conditional aggregates for efficiency.
 */
export async function fetchDataQualityOverview(): Promise<DataQualityOverview> {
  const now = new Date();

  // Main aggregates in one query
  const [mainStats] = await db
    .select({
      totalActiveEvents: count(),
      missingImageCount: sql<number>`count(*) FILTER (WHERE ${events.imageUrl} IS NULL)`,
      missingDescriptionCount: sql<number>`count(*) FILTER (WHERE ${events.description} IS NULL)`,
      missingCoordsCount: sql<number>`count(*) FILTER (WHERE ${events.lat} IS NULL OR ${events.lng} IS NULL)`,
    })
    .from(events)
    .where(eq(events.status, 'active'));

  // Stale event count (separate because it needs a date condition)
  const [staleStats] = await db
    .select({ staleCount: count() })
    .from(events)
    .where(
      and(
        eq(events.status, 'active'),
        lt(events.startAt, now),
        or(isNull(events.endAt), lt(events.endAt, now))
      )
    );

  // Per-source breakdown
  const sourceBreakdown = await db
    .select({
      sourceType: events.sourceType,
      totalCount: count(),
      missingImageCount: sql<number>`count(*) FILTER (WHERE ${events.imageUrl} IS NULL)`,
      missingDescriptionCount: sql<number>`count(*) FILTER (WHERE ${events.description} IS NULL)`,
      missingCoordsCount: sql<number>`count(*) FILTER (WHERE ${events.lat} IS NULL OR ${events.lng} IS NULL)`,
    })
    .from(events)
    .where(eq(events.status, 'active'))
    .groupBy(events.sourceType)
    .orderBy(sql`count(*) DESC`);

  return {
    totalActiveEvents: Number(mainStats.totalActiveEvents),
    staleEventCount: Number(staleStats.staleCount),
    missingImageCount: Number(mainStats.missingImageCount),
    missingDescriptionCount: Number(mainStats.missingDescriptionCount),
    missingCoordsCount: Number(mainStats.missingCoordsCount),
    duplicateSuspectCount: 0, // Computed lazily — requires pairwise comparison
    averageQualityScore: null, // Populated after first batch audit
    sourceBreakdown: sourceBreakdown.map((row) => ({
      sourceType: row.sourceType,
      totalCount: Number(row.totalCount),
      missingImageCount: Number(row.missingImageCount),
      missingDescriptionCount: Number(row.missingDescriptionCount),
      missingCoordsCount: Number(row.missingCoordsCount),
    })),
  };
}
