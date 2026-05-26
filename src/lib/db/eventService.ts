import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq, gte, lte, count } from 'drizzle-orm';
import type { FetchEventsParams } from '@/types';

export async function fetchEventsNearLocation(params: FetchEventsParams) {
  const conditions = [
    gte(events.lat, params.minLat),
    lte(events.lat, params.maxLat),
    gte(events.lng, params.minLng),
    lte(events.lng, params.maxLng),
    eq(events.status, 'active'),
  ];

  if (params.startDate) {
    conditions.push(gte(events.startAt, params.startDate));
  }

  if (params.endDate) {
    conditions.push(lte(events.startAt, params.endDate));
  }

  if (params.category) {
    conditions.push(eq(events.category, params.category as any));
  }

  const whereClause = and(...conditions);

  // Get total count for pagination metadata
  const countResult = await db
    .select({ total: count() })
    .from(events)
    .where(whereClause);
  const total = countResult[0]?.total || 0;

  // Get paginated events list ordered by date
  const data = await db
    .select()
    .from(events)
    .where(whereClause)
    .orderBy(events.startAt)
    .limit(params.limit)
    .offset(params.offset);

  return {
    events: data,
    total,
  };
}
