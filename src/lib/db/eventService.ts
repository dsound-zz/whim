import { db } from '@/db';
import { events, eventVerificationLogs } from '@/db/schema';
import { and, eq, gte, lte, count, sql, ilike, or, desc } from 'drizzle-orm';
import type { FetchEventsParams, AdminEvent } from '@/types';
import crypto from 'crypto';

export interface FetchAdminEventsParams {
  statusFilter?: 'active' | 'draft' | 'all';
  sourceFilter?: string;
  dateFilter?: 'all' | 'tonight' | 'this_week';
  searchQuery?: string;
  limit?: number;
}

/**
 * Fetches events for the admin dashboard.
 *
 * - Left-joins event_verification_logs so each row includes the latest
 *   verification status without a separate query.
 * - Uses a window function to de-duplicate recurring events (same title +
 *   venue), keeping the earliest occurrence as the representative row while
 *   counting the rest as moreDates.
 * - Respects statusFilter, sourceFilter, dateFilter, and searchQuery.
 *
 * This is the single authoritative query for the admin Events tab. All raw
 * DB access for the admin events page should go through here, not via
 * db.execute() in the route layer.
 */
export async function fetchAdminEvents(params: FetchAdminEventsParams = {}): Promise<AdminEvent[]> {
  const {
    statusFilter = 'all',
    sourceFilter,
    dateFilter = 'all',
    searchQuery,
    limit = 1000,
  } = params;

  try {
    // Build WHERE predicates dynamically so we avoid injecting user input
    // into the raw SQL template string.
    const statusCondition =
      statusFilter === 'active'
        ? sql`e.status = 'active'`
        : statusFilter === 'draft'
        ? sql`(e.status = 'draft' AND e.source_type = 'direct_submission')`
        : sql`(e.status = 'active' OR (e.status = 'draft' AND e.source_type = 'direct_submission'))`;

    const sourceCondition =
      sourceFilter && sourceFilter !== 'all'
        ? sql`AND e.source_type = ${sourceFilter}`
        : sql``;

    const tonight = new Date();
    tonight.setHours(0, 0, 0, 0);
    const tomorrowDate = new Date(tonight);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const nextWeekDate = new Date(tonight);
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);

    const dateCondition =
      dateFilter === 'tonight'
        ? sql`AND e.start_at >= ${tonight} AND e.start_at < ${tomorrowDate}`
        : dateFilter === 'this_week'
        ? sql`AND e.start_at >= ${tonight} AND e.start_at < ${nextWeekDate}`
        : sql``;

    const searchCondition =
      searchQuery && searchQuery.trim().length > 0
        ? sql`AND (e.title ILIKE ${'%' + searchQuery.trim() + '%'} OR e.venue_name ILIKE ${'%' + searchQuery.trim() + '%'})`
        : sql``;

    // Deduplicated query: window function ranks rows by (title, venue_name),
    // keeping the soonest start_at as rn=1. The counts query then provides
    // the moreDates value for that representative row.
    const deduped = await db.execute(sql`
      SELECT
        e.id, e.title, e.venue_name, e.address, e.lat, e.lng,
        e.start_at, e.end_at, e.is_free, e.price_min, e.price_max,
        e.ticket_url, e.source_type, e.category, e.status,
        e.is_verified, e.image_url, e.description, e.confidence_score,
        evl.status AS verification_status,
        evl.coord_delta_meters,
        ROW_NUMBER() OVER (
          PARTITION BY e.title, e.venue_name
          ORDER BY e.start_at ASC
        ) AS rn
      FROM events e
      LEFT JOIN event_verification_logs evl ON evl.event_id = e.id
      WHERE ${statusCondition}
        ${sourceCondition}
        ${dateCondition}
        ${searchCondition}
      ORDER BY e.start_at ASC
      LIMIT ${limit}
    `);

    // Count additional occurrences for recurring events
    const countsRaw = await db.execute(sql`
      SELECT e.title, e.venue_name, COUNT(*) AS cnt
      FROM events e
      WHERE ${statusCondition}
        ${sourceCondition}
        ${dateCondition}
        ${searchCondition}
      GROUP BY e.title, e.venue_name
      HAVING COUNT(*) > 1
    `);

    const countMap = new Map<string, number>();
    for (const row of countsRaw.rows as { title: string; venue_name: string | null; cnt: string }[]) {
      countMap.set(`${row.title}|${row.venue_name}`, parseInt(row.cnt, 10));
    }

    type RawRow = {
      id: string;
      title: string;
      venue_name: string | null;
      address: string | null;
      lat: number | null;
      lng: number | null;
      start_at: string;
      end_at: string | null;
      is_free: boolean | null;
      price_min: number | null;
      price_max: number | null;
      ticket_url: string | null;
      source_type: string;
      category: string | null;
      status: string | null;
      is_verified: boolean | null;
      image_url: string | null;
      description: string | null;
      confidence_score: number | null;
      verification_status: string | null;
      coord_delta_meters: number | null;
      rn: string;
    };

    return (deduped.rows as RawRow[])
      .filter((row) => parseInt(row.rn, 10) === 1)
      .map((row) => {
        const moreDatesTotal = countMap.get(`${row.title}|${row.venue_name}`) ?? 1;
        return {
          id: row.id,
          title: row.title,
          venueName: row.venue_name,
          address: row.address,
          lat: row.lat,
          lng: row.lng,
          startAt: new Date(row.start_at),
          endAt: row.end_at ? new Date(row.end_at) : null,
          isFree: row.is_free,
          priceMin: row.price_min,
          priceMax: row.price_max,
          ticketUrl: row.ticket_url,
          sourceType: row.source_type,
          category: row.category,
          status: row.status,
          isVerified: row.is_verified,
          imageUrl: row.image_url,
          description: row.description,
          confidenceScore: row.confidence_score,
          verificationStatus: row.verification_status,
          coordDeltaMeters: row.coord_delta_meters,
          moreDates: moreDatesTotal > 1 ? moreDatesTotal - 1 : undefined,
        } satisfies AdminEvent;
      });
  } catch (err) {
    console.error('[eventService] fetchAdminEvents failed:', err);
    return [];
  }
}
import { getTimeframeRange, type Timeframe } from '@/lib/utils/date';
import { deduplicateEvents, collapseRecurringShows } from '@/lib/utils/deduplicateEvents';

// Minimum trigram similarity threshold.
// 0.1 is intentionally low — we layer in ILIKE as a tie-breaker and rely on
// ORDER BY similarity DESC to surface the best matches at the top.
const TRGM_THRESHOLD = 0.1;


/**
 * Returns the set of category slugs that have at least one active event
 * within the given bounding box and timeframe. Used to disable empty
 * category filter pills in the consumer feed.
 */
export async function fetchAvailableCategories(params: {
  minLat: number; maxLat: number;
  minLng: number; maxLng: number;
  timeframe?: Timeframe;
}): Promise<string[]> {
  const conditions = [
    gte(events.lat, params.minLat),
    lte(events.lat, params.maxLat),
    gte(events.lng, params.minLng),
    lte(events.lng, params.maxLng),
    eq(events.status, 'active'),
    sql`("end_at" > now() OR ("end_at" IS NULL AND "start_at" > now() - INTERVAL '4 hours'))`,
  ];

  if (params.timeframe) {
    const { start, end } = getTimeframeRange(params.timeframe);
    conditions.push(gte(events.startAt, start));
    conditions.push(lte(events.startAt, end));
  }

  const rows = await db
    .selectDistinct({ category: events.category })
    .from(events)
    .where(and(...conditions));

  return rows.map((r) => r.category as string).filter((c): c is string => c !== null);
}

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

  // Fetch extra rows to compensate for records that get collapsed by both
  // cross-platform dedup and recurring-show collapsing
  const fetchLimit = params.limit * 3;

  // Get paginated events — order by relevance desc, then by date
  const data = await db
    .select()
    .from(events)
    .where(whereClause)
    .orderBy(hasSearch ? desc(relevanceScore) : events.startAt, events.startAt)
    .limit(fetchLimit)
    .offset(params.offset);

  // Step 1: Collapse same-show duplicates across platforms (e.g. TM box-office
  // vs. resale IDs for the same event at the same time).
  const deduplicated = deduplicateEvents(data);

  // Step 2: Collapse recurring shows — same title + venue on different dates
  // (e.g. 257 rows of "Cats" → 1 row with futureOccurrenceCount = 257).
  const collapsed = collapseRecurringShows(deduplicated);

  const finalEvents = collapsed.slice(0, params.limit);

  return {
    events: finalEvents,
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



