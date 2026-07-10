import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const radiusMiles = searchParams.get('radiusMiles') || '5';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const conditions = [
      eq(events.status, 'active'),
      sql`("end_at" > now() OR ("end_at" IS NULL AND "start_at" > now() - INTERVAL '4 hours'))`,
    ];

    if (lat && lng) {
      const latFloat = parseFloat(lat);
      const lngFloat = parseFloat(lng);
      const radiusFloat = parseFloat(radiusMiles);
      const latOffset = radiusFloat / 69.0;
      const lngOffset = radiusFloat / (69.0 * Math.cos(latFloat * (Math.PI / 180)));

      conditions.push(gte(events.lat, latFloat - latOffset));
      conditions.push(lte(events.lat, latFloat + latOffset));
      conditions.push(gte(events.lng, lngFloat - lngOffset));
      conditions.push(lte(events.lng, lngFloat + lngOffset));
    }

    if (startDate) conditions.push(gte(events.startAt, new Date(startDate)));
    if (endDate) conditions.push(lte(events.startAt, new Date(endDate)));

    const results = await db
      .select({
        id: events.id,
        externalId: events.externalId,
        sourceType: events.sourceType,
        title: events.title,
        description: events.description,
        category: events.category,
        imageUrl: events.imageUrl,
        startAt: events.startAt,
        endAt: events.endAt,
        venueName: events.venueName,
        address: events.address,
        lat: events.lat,
        lng: events.lng,
        isFree: events.isFree,
        priceMin: events.priceMin,
        priceMax: events.priceMax,
        currency: events.currency,
        ticketUrl: events.ticketUrl,
        ticketUrls: events.ticketUrls,
        platform: events.platform,
        status: events.status,
        createdAt: events.createdAt,
        updatedAt: events.updatedAt,
      })
      .from(events)
      .where(and(...conditions))
      .orderBy(events.startAt)
      .limit(100);

    return NextResponse.json({ success: true, count: results.length, data: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('API /events error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
