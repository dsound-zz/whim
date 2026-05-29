/**
 * verificationService.ts
 *
 * All database access for the event_verification_logs table.
 * Consumed by:
 *  - scripts/run-integrity-check.ts   (write path, batch cron)
 *  - src/app/admin/verification/      (read path, admin dashboard)
 */

import { db } from '@/db';
import { eventVerificationLogs, events } from '@/db/schema';
import { eq, desc, count, sql, and } from 'drizzle-orm';
import type {
  VerificationResult,
  VerificationLog,
  VerificationStats,
  VerificationStatus,
} from '@/types/verification';

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Upserts a VerificationResult into event_verification_logs.
 * The unique index on eventId ensures only the latest check is kept per event —
 * on conflict we overwrite every column so the row always reflects the most recent run.
 */
export async function saveVerificationLog(
  result: VerificationResult
): Promise<void> {
  await db
    .insert(eventVerificationLogs)
    .values({
      eventId: result.eventId,
      status: result.status,
      pageTextSnippet: result.pageTextSnippet,
      llmConfirmed: result.llmConfirmed,
      llmReason: result.llmReason,
      storedLat: result.storedLat,
      storedLng: result.storedLng,
      mapboxLat: result.mapboxLat,
      mapboxLng: result.mapboxLng,
      coordDeltaMeters: result.coordDeltaMeters,
      mismatchReason: result.mismatchReason,
      errorMessage: result.errorMessage,
      checkedAt: new Date(),
    })
    .onConflictDoUpdate({
      // The unique index evl_event_id_idx makes eventId the natural upsert key.
      target: eventVerificationLogs.eventId,
      set: {
        checkedAt: new Date(),
        status: result.status,
        pageTextSnippet: result.pageTextSnippet,
        llmConfirmed: result.llmConfirmed,
        llmReason: result.llmReason,
        storedLat: result.storedLat,
        storedLng: result.storedLng,
        mapboxLat: result.mapboxLat,
        mapboxLng: result.mapboxLng,
        coordDeltaMeters: result.coordDeltaMeters,
        mismatchReason: result.mismatchReason,
        errorMessage: result.errorMessage,
      },
    });
}

// ─── Read — log list ──────────────────────────────────────────────────────────

export interface FetchVerificationLogsParams {
  statusFilter?: VerificationStatus | 'all';
  limit?: number;
  offset?: number;
}

/**
 * Fetches verification logs joined with the parent event's title, venue name,
 * and ticket URL for display in the admin dashboard table.
 */
export async function fetchVerificationLogs(
  params: FetchVerificationLogsParams = {}
): Promise<VerificationLog[]> {
  const { statusFilter = 'all', limit = 100, offset = 0 } = params;

  const rows = await db
    .select({
      id: eventVerificationLogs.id,
      eventId: eventVerificationLogs.eventId,
      eventTitle: events.title,
      eventVenueName: events.venueName,
      ticketUrl: events.ticketUrl,
      checkedAt: eventVerificationLogs.checkedAt,
      status: eventVerificationLogs.status,
      llmConfirmed: eventVerificationLogs.llmConfirmed,
      llmReason: eventVerificationLogs.llmReason,
      coordDeltaMeters: eventVerificationLogs.coordDeltaMeters,
      mismatchReason: eventVerificationLogs.mismatchReason,
      errorMessage: eventVerificationLogs.errorMessage,
    })
    .from(eventVerificationLogs)
    .innerJoin(events, eq(eventVerificationLogs.eventId, events.id))
    .where(
      statusFilter !== 'all'
        ? eq(eventVerificationLogs.status, statusFilter)
        : undefined
    )
    .orderBy(desc(eventVerificationLogs.checkedAt))
    .limit(limit)
    .offset(offset);

  return rows as VerificationLog[];
}

// ─── Read — stats ─────────────────────────────────────────────────────────────

/**
 * Aggregates counts by status and returns the timestamp of the most recent check.
 * Used to populate the VerificationStatsBar component.
 */
export async function fetchVerificationStats(): Promise<VerificationStats> {
  const countRows = await db
    .select({
      status: eventVerificationLogs.status,
      total: count(),
    })
    .from(eventVerificationLogs)
    .groupBy(eventVerificationLogs.status);

  const latestRow = await db
    .select({ lastCheckedAt: eventVerificationLogs.checkedAt })
    .from(eventVerificationLogs)
    .orderBy(desc(eventVerificationLogs.checkedAt))
    .limit(1);

  const countByStatus = Object.fromEntries(
    countRows.map((row) => [row.status, Number(row.total)])
  ) as Partial<Record<VerificationStatus, number>>;

  const totalChecked = countRows.reduce((sum, row) => sum + Number(row.total), 0);

  return {
    totalChecked,
    verified: countByStatus['verified'] ?? 0,
    flaggedContent: countByStatus['flagged_content'] ?? 0,
    flaggedCoordinates: countByStatus['flagged_coordinates'] ?? 0,
    flaggedBoth: countByStatus['flagged_both'] ?? 0,
    skipped: countByStatus['skipped'] ?? 0,
    errors: countByStatus['error'] ?? 0,
    lastCheckedAt: latestRow[0]?.lastCheckedAt ?? null,
  };
}

// ─── Read — single event log ──────────────────────────────────────────────────

/**
 * Fetches the latest verification log for a specific event.
 * Used by the admin event detail view to show inline integrity status.
 */
export async function fetchVerificationLogForEvent(
  eventId: string
): Promise<VerificationLog | null> {
  const rows = await db
    .select({
      id: eventVerificationLogs.id,
      eventId: eventVerificationLogs.eventId,
      eventTitle: events.title,
      eventVenueName: events.venueName,
      ticketUrl: events.ticketUrl,
      checkedAt: eventVerificationLogs.checkedAt,
      status: eventVerificationLogs.status,
      llmConfirmed: eventVerificationLogs.llmConfirmed,
      llmReason: eventVerificationLogs.llmReason,
      coordDeltaMeters: eventVerificationLogs.coordDeltaMeters,
      mismatchReason: eventVerificationLogs.mismatchReason,
      errorMessage: eventVerificationLogs.errorMessage,
    })
    .from(eventVerificationLogs)
    .innerJoin(events, eq(eventVerificationLogs.eventId, events.id))
    .where(eq(eventVerificationLogs.eventId, eventId))
    .limit(1);

  return rows.length > 0 ? (rows[0] as VerificationLog) : null;
}
