import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { and, gte, lte } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const radiusMiles = searchParams.get('radiusMiles') || '5';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // For MVP, we use a simple bounding box instead of PostGIS ST_DWithin
    // 1 degree latitude ~= 69 miles
    // 1 degree longitude ~= 69 miles * cos(lat)
    let conditions = [];

    if (lat && lng) {
      const latFloat = parseFloat(lat);
      const lngFloat = parseFloat(lng);
      const radiusFloat = parseFloat(radiusMiles);

      const latOffset = radiusFloat / 69.0;
      const lngOffset = radiusFloat / (69.0 * Math.cos(latFloat * (Math.PI / 180)));

      // Note: In Drizzle, raw SQL queries are better for complex where clauses,
      // but for simplicity we will use standard Drizzle operators on the model.
      conditions.push(gte(events.lat, latFloat - latOffset));
      conditions.push(lte(events.lat, latFloat + latOffset));
      conditions.push(gte(events.lng, lngFloat - lngOffset));
      conditions.push(lte(events.lng, lngFloat + lngOffset));
    }

    if (startDate) {
      conditions.push(gte(events.startAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(events.endAt, new Date(endDate)));
    }

    // Only active events
    // conditions.push(eq(events.status, 'active'));

    const results = await db.query.events.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (events, { asc }) => [asc(events.startAt)],
      limit: 100, // safety limit
    });

    return NextResponse.json({ success: true, count: results.length, data: results });
  } catch (error: any) {
    console.error('API /events error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
