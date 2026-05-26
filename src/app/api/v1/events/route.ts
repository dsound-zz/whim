import { NextRequest, NextResponse } from 'next/server';
import { fetchEventsNearLocation } from '@/lib/db/eventService';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');

  if (!latStr || !lngStr) {
    return NextResponse.json(
      { error: 'Latitude (lat) and Longitude (lng) query parameters are required.' },
      { status: 400 }
    );
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json(
      { error: 'Latitude (lat) and Longitude (lng) must be valid numbers.' },
      { status: 400 }
    );
  }

  // Parse radius, defaulting to 10 miles
  const radiusStr = searchParams.get('radius');
  let radius = parseFloat(radiusStr || '10');
  if (isNaN(radius) || radius <= 0) {
    radius = 10;
  }

  // Parse category (optional)
  const category = searchParams.get('category') || undefined;

  // Parse date range (optional)
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (startDateStr) {
    startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json(
        { error: 'startDate must be a valid ISO date string.' },
        { status: 400 }
      );
    }
  }

  if (endDateStr) {
    endDate = new Date(endDateStr);
    if (isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'endDate must be a valid ISO date string.' },
        { status: 400 }
      );
    }
  }

  // Parse pagination, default page=1, limit=20
  const pageStr = searchParams.get('page');
  const limitStr = searchParams.get('limit');
  let page = parseInt(pageStr || '1', 10);
  let limit = parseInt(limitStr || '20', 10);

  if (isNaN(page) || page < 1) {
    page = 1;
  }
  if (isNaN(limit) || limit < 1) {
    limit = 20;
  } else if (limit > 100) {
    limit = 100; // Cap limit at 100 for stability
  }

  // Bounding box calculations:
  // 1 degree of latitude is ~69 miles.
  // 1 degree of longitude is ~69 * cos(lat) miles.
  const latDegreeDelta = radius / 69.0;
  const lngDegreeDelta = radius / (69.0 * Math.cos((lat * Math.PI) / 180.0));

  const minLat = lat - latDegreeDelta;
  const maxLat = lat + latDegreeDelta;
  const minLng = lng - lngDegreeDelta;
  const maxLng = lng + lngDegreeDelta;

  try {
    const offset = (page - 1) * limit;

    const { events, total } = await fetchEventsNearLocation({
      minLat,
      maxLat,
      minLng,
      maxLng,
      startDate,
      endDate,
      category,
      limit,
      offset,
    });

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      data: events,
      pagination: {
        page,
        limit,
        totalCount: total,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error('Fetch public events error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
