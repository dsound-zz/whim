'use server';

import {
  fetchVerificationLogs,
  fetchVerificationStats,
} from '@/lib/db/verificationService';
import { verifyEventIntegrity } from '@/lib/verification/verifyEventIntegrity';
import { saveVerificationLog } from '@/lib/db/verificationService';
import { db } from '@/db';
import { events, eventVerificationLogs } from '@/db/schema';
import { eq, gt, and, count } from 'drizzle-orm';
import type { VerificationLog, VerificationStats, VerificationStatus } from '@/types/verification';

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
