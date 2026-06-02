import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq, gte, lte, count, sql } from 'drizzle-orm';
import type { FetchEventsParams } from '@/types';
import crypto from 'crypto';
import { getTimeframeRange } from '@/lib/utils/date';

export async function fetchEventsNearLocation(params: FetchEventsParams) {
  const conditions = [
    gte(events.lat, params.minLat),
    lte(events.lat, params.maxLat),
    gte(events.lng, params.minLng),
    lte(events.lng, params.maxLng),
    eq(events.status, 'active'),
    sql`"end_at" > now() OR ("end_at" IS NULL AND "start_at" > now() - INTERVAL '4 hours')`
  ];

  if (params.timeframe) {
    const { start, end } = getTimeframeRange(params.timeframe);
    conditions.push(gte(events.startAt, start));
    conditions.push(lte(events.startAt, end));
  } else {
    if (params.startDate) {
      conditions.push(gte(events.startAt, params.startDate));
    }
    if (params.endDate) {
      conditions.push(lte(events.startAt, params.endDate));
    }
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

export async function updateEventStatus(
  id: string,
  status: 'active' | 'cancelled' | 'expired' | 'draft'
): Promise<void> {
  await db
    .update(events)
    .set({ status, updatedAt: new Date() })
    .where(eq(events.id, id));
}

export async function insertDraftEvent(payload: {
  title: string;
  venueName: string;
  address: string;
  startAt: Date;
  ticketUrl: string;
  submitterEmail: string;
  lat: number | null;
  lng: number | null;
}) {
  const { submitterEmail, ...eventData } = payload;
  const externalId = `submission_${crypto.randomUUID()}`;

  const [newEvent] = await db
    .insert(events)
    .values({
      externalId,
      sourceType: 'direct_submission',
      title: eventData.title,
      venueName: eventData.venueName,
      address: eventData.address,
      startAt: eventData.startAt,
      ticketUrl: eventData.ticketUrl,
      lat: eventData.lat,
      lng: eventData.lng,
      status: 'draft',
      confidenceScore: 1.0,
      isVerified: false,
      rawSource: {
        submitterEmail,
        submittedAt: new Date().toISOString(),
        ...eventData,
      },
    })
    .returning();

  return newEvent;
}

export async function publishDraftEvent(eventId: string): Promise<void> {
  await db
    .update(events)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(events.id, eventId));
}



