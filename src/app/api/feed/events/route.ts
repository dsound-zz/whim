import { NextRequest, NextResponse } from "next/server";
import { fetchEventsNearLocation } from "@/lib/db/eventService";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const latStr = searchParams.get("lat");
  const lngStr = searchParams.get("lng");
  // Default timeframe instead of 'date' to align with v1 API
  const timeframe = (searchParams.get("timeframe") || "tonight") as 'tonight' | 'next_2_days' | 'this_week';
  const category = searchParams.get("category") || undefined;
  const search = searchParams.get("search") || undefined;
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  // Default to NYC if no location provided
  const lat = latStr ? parseFloat(latStr) : 40.7128;
  const lng = lngStr ? parseFloat(lngStr) : -74.0060;

  // Bounding box calculations (approx 10 miles):
  const latDegreeDelta = 10 / 69.0;
  const lngDegreeDelta = 10 / (69.0 * Math.cos((lat * Math.PI) / 180.0));

  const minLat = lat - latDegreeDelta;
  const maxLat = lat + latDegreeDelta;
  const minLng = lng - lngDegreeDelta;
  const maxLng = lng + lngDegreeDelta;

  try {
    const { events } = await fetchEventsNearLocation({
      minLat,
      maxLat,
      minLng,
      maxLng,
      timeframe,
      category,
      search,
      limit,
      offset,
    });

    return NextResponse.json({ success: true, data: events });
  } catch (error) {
    console.error("Feed API Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
