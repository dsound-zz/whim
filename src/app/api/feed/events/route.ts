import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { and, eq, isNotNull, gte, lt } from "drizzle-orm";
import { calculateDistanceMiles } from "@/lib/utils/calculateDistance";
import { deduplicateEvents } from "@/lib/utils/deduplicateEvents";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const latStr = searchParams.get("lat");
  const lngStr = searchParams.get("lng");
  const dateFilter = searchParams.get("date") || "tonight";
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  // Default to NYC if no location provided
  const userLat = latStr ? parseFloat(latStr) : 40.7128;
  const userLng = lngStr ? parseFloat(lngStr) : -74.0060;

  // Date boundaries
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();

  if (dateFilter === "tonight") {
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
  } else if (dateFilter === "tomorrow") {
    startDate.setDate(now.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);
    endDate.setDate(now.getDate() + 1);
    endDate.setHours(23, 59, 59, 999);
  } else if (dateFilter === "weekend") {
    const day = now.getDay();
    const daysUntilFriday = day <= 5 ? 5 - day : 6;
    startDate.setDate(now.getDate() + daysUntilFriday);
    startDate.setHours(0, 0, 0, 0);
    endDate.setDate(startDate.getDate() + 2); // Sunday
    endDate.setHours(23, 59, 59, 999);
  }

  try {
    const fetchedEvents = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.status, "active"),
          isNotNull(events.lat),
          isNotNull(events.lng),
          gte(events.startAt, startDate),
          lt(events.startAt, endDate)
        )
      );

    const withDistance = fetchedEvents.map(event => ({
      ...event,
      distanceMiles: calculateDistanceMiles(userLat, userLng, event.lat!, event.lng!),
    }));

    const deduped = deduplicateEvents(withDistance);

    const sortedEvents = deduped
      .sort((a, b) => {
        if (a.distanceMiles !== b.distanceMiles) {
          return a.distanceMiles - b.distanceMiles;
        }
        return a.startAt.getTime() - b.startAt.getTime();
      })
      .slice(offset, offset + limit);

    return NextResponse.json({ success: true, data: sortedEvents });
  } catch (error) {
    console.error("Feed API Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
