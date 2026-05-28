import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq, isNull, lt, or } from 'drizzle-orm';

/**
 * Marks past events as 'expired'.
 *
 * Logic:
 * - If an event has an endAt: expire it when endAt is in the past.
 * - If an event has no endAt: expire it when startAt is more than 6 hours ago
 *   (gives a buffer for events that run long without a defined end time).
 *
 * Only touches events currently in 'active' status to avoid double-processing.
 */
async function run() {
  console.log('[ExpireEvents] Starting stale event expiration job...');
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  try {
    const expiredEvents = await db
      .update(events)
      .set({
        status: 'expired',
        updatedAt: now,
      })
      .where(
        and(
          eq(events.status, 'active'),
          or(
            // Has an explicit end time that has passed
            lt(events.endAt, now),
            // No end time but started more than 6 hours ago
            and(
              isNull(events.endAt),
              lt(events.startAt, sixHoursAgo)
            )
          )
        )
      )
      .returning({
        id: events.id,
        sourceType: events.sourceType,
      });

    // Log a breakdown by source so we can spot anomalies
    const countBySource = expiredEvents.reduce<Record<string, number>>((acc, event) => {
      acc[event.sourceType] = (acc[event.sourceType] ?? 0) + 1;
      return acc;
    }, {});

    console.log(`[ExpireEvents] Expired ${expiredEvents.length} events.`);
    if (expiredEvents.length > 0) {
      console.log('[ExpireEvents] Breakdown by source:', countBySource);
    }
  } catch (error) {
    console.error('[ExpireEvents] Job failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

run();
