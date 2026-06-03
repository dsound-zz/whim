import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq, gte, lte, count, sql, ilike, or, desc } from 'drizzle-orm';
import type { FetchEventsParams } from '@/types';
import crypto from 'crypto';
import { getTimeframeRange } from '@/lib/utils/date';
import { deduplicateEvents } from '@/lib/utils/deduplicateEvents';

// Minimum trigram similarity threshold.
// 0.1 is intentionally low — we layer in ILIKE as a tie-breaker and rely on
// ORDER BY similarity DESC to surface the best matches at the top.
const TRGM_THRESHOLD = 0.1;


export async function fetchEventsNearLocation(params: FetchEventsParams) {
  const conditions = [
    gte(events.lat, params.minLat),
    lte(events.lat, params.maxLat),
    gte(events.lng, params.minLng),
    lte(events.lng, params.maxLng),
    eq(events.status, 'active'),
    sql`("end_at" > now() OR ("end_at" IS NULL AND "start_at" > now() - INTERVAL '4 hours'))`
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


  if (params.search && params.search.trim().length > 0) {
    const queryText = params.search.trim();

    if (queryText.length >= 3) {
      // Fuzzy trigram search: matches regardless of word order, handles partial
      // words and light typos. The `%` operator uses pg_trgm's similarity().
      // We set a low threshold and rely on ORDER BY to rank results.
      conditions.push(
        sql`(
          similarity(${events.title}, ${queryText}) > ${TRGM_THRESHOLD}
          OR similarity(${events.venueName}, ${queryText}) > ${TRGM_THRESHOLD}
          OR ${events.title} ILIKE ${'%' + queryText + '%'}
          OR ${events.venueName} ILIKE ${'%' + queryText + '%'}
        )`
      );
    } else {
      // Short query: trigram needs ≥3 chars to be useful; use plain substring match
      const likePattern = `%${queryText}%`;
      conditions.push(
        or(
          ilike(events.title, likePattern),
          ilike(events.venueName, likePattern)
        )!
      );
    }
  }

  const whereClause = and(...conditions);

  // Relevance expression: highest of title/venue similarity scores.
  // Falls back to 0 when no search query so ordering is stable.
  const hasSearch = (params.search?.trim().length ?? 0) >= 3;
  const relevanceScore = hasSearch
    ? sql<number>`GREATEST(
        similarity(${events.title}, ${params.search!.trim()}),
        similarity(${events.venueName}, ${params.search!.trim()})
      )`
    : sql<number>`0`;

  // Get total count for pagination metadata
  const countResult = await db
    .select({ total: count() })
    .from(events)
    .where(whereClause);
  const total = countResult[0]?.total || 0;

  // Fetch extra rows to compensate for records that get collapsed by dedup
  const fetchLimit = params.limit * 2;

  // Get paginated events — order by relevance desc, then by date
  const data = await db
    .select()
    .from(events)
    .where(whereClause)
    .orderBy(hasSearch ? desc(relevanceScore) : events.startAt, events.startAt)
    .limit(fetchLimit)
    .offset(params.offset);

  // Collapse same-show duplicates (e.g. TM box-office vs. resale IDs for the
  // same event) before returning. Slice back to the requested limit afterwards.
  const deduplicated = deduplicateEvents(data).slice(0, params.limit);

  return {
    events: deduplicated,
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



