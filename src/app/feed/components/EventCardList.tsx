"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EventCard, type EventLiveStatus } from "./EventCard";
import { EventCardSkeleton } from "./EventCardSkeleton";
import {
  describeRelativeDay,
  formatHourBandLabel,
  getNycDayKey,
  getNycHour,
} from "@/lib/utils/formatEventTime";
import type { FeedEvent } from "@/types";

type EventCardListProps = {
  events: FeedEvent[];
  isLoading: boolean;
  selectedEventId: string | null;
  onEventHover: (id: string | null) => void;
  activeTimeFilter: string;
  /**
   * Serialised URLSearchParams string for the current feed state (e.g.
   * "timeframe=this_week&category=theater"). Appended to each event detail
   * link so that browser back-navigation returns to /feed with filters intact.
   */
  feedParams: string;
};

type HourBand = {
  hour: number;
  events: FeedEvent[];
};

type DayGroup = {
  dayKey: string;
  firstStartAt: Date | string;
  hourBands: HourBand[];
};

const STARTING_SOON_WINDOW_MS = 60 * 60 * 1000;
// Sources often omit endAt; assume a show runs about two hours.
const ASSUMED_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;
const LIVE_STATUS_REFRESH_MS = 60 * 1000;

function groupEventsByDayAndHour(events: FeedEvent[]): DayGroup[] {
  const sortedEvents = [...events].sort(
    (first, second) => new Date(first.startAt).getTime() - new Date(second.startAt).getTime()
  );

  const dayGroups: DayGroup[] = [];
  for (const event of sortedEvents) {
    const dayKey = getNycDayKey(event.startAt);
    const hour = getNycHour(event.startAt);

    let currentDay = dayGroups[dayGroups.length - 1];
    if (!currentDay || currentDay.dayKey !== dayKey) {
      currentDay = { dayKey, firstStartAt: event.startAt, hourBands: [] };
      dayGroups.push(currentDay);
    }

    let currentBand = currentDay.hourBands[currentDay.hourBands.length - 1];
    if (!currentBand || currentBand.hour !== hour) {
      currentBand = { hour, events: [] };
      currentDay.hourBands.push(currentBand);
    }
    currentBand.events.push(event);
  }
  return dayGroups;
}

function determineLiveStatus(event: FeedEvent, nowMs: number): EventLiveStatus {
  const startMs = new Date(event.startAt).getTime();
  const endMs = event.endAt ? new Date(event.endAt).getTime() : startMs + ASSUMED_EVENT_DURATION_MS;
  if (startMs <= nowMs && nowMs < endMs) return "happening_now";
  if (startMs > nowMs && startMs - nowMs <= STARTING_SOON_WINDOW_MS) return "starting_soon";
  return null;
}

export function EventCardList({
  events,
  isLoading,
  selectedEventId,
  onEventHover,
  activeTimeFilter,
  feedParams,
}: EventCardListProps) {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Live status depends on the viewer's clock, so it is only computed after
  // mount to keep the server and first client render identical.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const refreshNow = () => setNowMs(Date.now());
    const firstTickId = window.setTimeout(refreshNow, 0);
    const intervalId = window.setInterval(refreshNow, LIVE_STATUS_REFRESH_MS);
    return () => {
      window.clearTimeout(firstTickId);
      window.clearInterval(intervalId);
    };
  }, []);

  const dayGroups = useMemo(() => groupEventsByDayAndHour(events), [events]);
  const shouldShowDayHeadings = activeTimeFilter !== "Tonight" || dayGroups.length > 1;

  // Scroll to selected card when selectedEventId changes (e.g. map marker clicked)
  useEffect(() => {
    if (!selectedEventId) return;
    cardRefs.current[selectedEventId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedEventId]);

  if (isLoading) {
    return (
      <div className="flex flex-col py-2" role="status" aria-label="Loading events">
        <EventCardSkeleton />
        <EventCardSkeleton />
        <EventCardSkeleton />
        <EventCardSkeleton />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-start py-16 px-5 max-w-sm">
        <h2 className="type-headline text-2xl text-moon mb-2">Nothing on the board</h2>
        <p className="text-sm text-haze leading-relaxed">
          {activeTimeFilter === "Tonight"
            ? "No events match these filters tonight. Widen the time range to the next two days, or choose Everything."
            : "No events match these filters. Try a different category or clear your search."}
        </p>
      </div>
    );
  }

  const buildEventHref = (id: string) => (feedParams ? `/feed/${id}?${feedParams}` : `/feed/${id}`);

  return (
    <div className="pb-6">
      {dayGroups.map((dayGroup) => (
        <section key={dayGroup.dayKey} aria-label={describeRelativeDay(dayGroup.firstStartAt)}>
          {shouldShowDayHeadings && (
            <h2
              className="sticky top-0 z-10 px-4 sm:px-5 py-2.5 bg-ink/95 backdrop-blur-sm border-b border-seam type-headline text-lg text-moon"
              suppressHydrationWarning
            >
              {describeRelativeDay(dayGroup.firstStartAt)}
            </h2>
          )}

          {dayGroup.hourBands.map((hourBand) => (
            <div key={hourBand.hour}>
              <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 pb-1" aria-hidden="true">
                <span className="text-xs font-semibold text-dim">{formatHourBandLabel(hourBand.hour)}</span>
                <span className="flex-1 h-px bg-seam" />
              </div>

              {hourBand.events.map((event) => (
                <div key={event.id} ref={(element) => { cardRefs.current[event.id] = element; }}>
                  <Link href={buildEventHref(event.id)} className="block focus-visible:outline-offset-[-2px]">
                    <EventCard
                      id={event.id}
                      title={event.title}
                      venueName={event.venueName}
                      startAt={event.startAt}
                      imageUrl={event.imageUrl}
                      priceMin={event.priceMin}
                      priceMax={event.priceMax}
                      isFree={event.isFree}
                      ticketUrl={event.ticketUrl}
                      category={event.category}
                      liveStatus={nowMs === null ? null : determineLiveStatus(event, nowMs)}
                      isSelected={selectedEventId === event.id}
                      onHover={onEventHover}
                    />
                  </Link>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
