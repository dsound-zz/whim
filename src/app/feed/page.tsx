import { Suspense } from "react";
import FeedMapUI from "./FeedMapUI";
import { fetchEventsNearLocation, fetchAvailableCategories } from "@/lib/db/eventService";
import type { FeedEvent } from "@/types";

type TimeframeValue = "tonight" | "next_2_days" | "this_week";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ timeframe?: string; category?: string; search?: string }>;
}) {
  const resolvedParams = await searchParams;
  const timeframe = (resolvedParams.timeframe ?? "tonight") as TimeframeValue;
  const category = resolvedParams.category ?? undefined;
  const search = resolvedParams.search ?? undefined;

  const userLat = 40.7128;
  const userLng = -74.0060;
  
  let initialEvents: FeedEvent[] = [];
  let availableCategories: string[] = [];

  const bboxParams = {
    minLat: userLat - 0.2,
    maxLat: userLat + 0.2,
    minLng: userLng - 0.2,
    maxLng: userLng + 0.2,
  };

  try {
    const [eventsResult, categories] = await Promise.all([
      fetchEventsNearLocation({ ...bboxParams, timeframe, category, search, limit: 150, offset: 0 }),
      fetchAvailableCategories({ ...bboxParams, timeframe: timeframe as "tonight" | "next_2_days" | "this_week" }),
    ]);
    initialEvents = eventsResult.events;
    availableCategories = categories;
  } catch (error) {
    console.error("Failed server fetch for feed:", error);
  }

  return (
    <div className="h-full overflow-hidden">
      <Suspense fallback={<div className="h-full bg-zinc-950" />}>
        <FeedMapUI initialEvents={initialEvents} availableCategories={availableCategories} />
      </Suspense>
    </div>
  );
}

