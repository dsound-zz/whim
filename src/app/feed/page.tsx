import { FeedList } from "@/components/feed/FeedList";
import { db } from "@/db";
import { events } from "@/db/schema";
import { and, eq, isNotNull, gte, lt } from "drizzle-orm";
import { calculateDistanceMiles } from "@/lib/utils/calculateDistance";
import { deduplicateEvents } from "@/lib/utils/deduplicateEvents";

export default async function FeedPage() {
  // Server-side initial fetch (NYC center, Tonight)
  const userLat = 40.7128;
  const userLng = -74.0060;
  
  const now = new Date();
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);

  let initialEvents: any[] = [];
  
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

    const withDistance = fetchedEvents
      .map(event => ({
        ...event,
        distanceMiles: calculateDistanceMiles(userLat, userLng, event.lat!, event.lng!),
      }));

    const deduped = deduplicateEvents(withDistance);

    initialEvents = deduped
      .sort((a, b) => {
        if (a.distanceMiles !== b.distanceMiles) {
          return a.distanceMiles - b.distanceMiles;
        }
        return a.startAt.getTime() - b.startAt.getTime();
      })
      .slice(0, 20);
  } catch (error) {
    console.error("Failed server fetch for feed:", error);
  }

  return (
    <div className="min-h-screen bg-black">
      <FeedList initialEvents={initialEvents} />
    </div>
  );
}
