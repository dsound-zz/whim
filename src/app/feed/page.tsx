import FeedMapUI from "./FeedMapUI";
import { fetchEventsNearLocation } from "@/lib/db/eventService";

export default async function FeedPage() {
  // Server-side initial fetch (NYC center, Tonight)
  const userLat = 40.7128;
  const userLng = -74.0060;
  
  let initialEvents: any[] = [];
  
  try {
    const { events } = await fetchEventsNearLocation({
      minLat: userLat - 0.2,
      maxLat: userLat + 0.2,
      minLng: userLng - 0.2,
      maxLng: userLng + 0.2,
      timeframe: 'tonight',
      limit: 100,
      offset: 0,
    });

    initialEvents = events;
  } catch (error) {
    console.error("Failed server fetch for feed:", error);
  }

  return (
    <div className="min-h-screen bg-black">
      <FeedMapUI initialEvents={initialEvents} />
    </div>
  );
}
