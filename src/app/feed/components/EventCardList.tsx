"use client";

import React, { useRef, useEffect } from "react";
import Link from "next/link";
import { EventCard } from "./EventCard";
import { EventCardSkeleton } from "./EventCardSkeleton";

type EventItem = {
  id: string;
  title: string;
  venueName: string | null;
  startAt: string | Date;
  imageUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  isFree: boolean | null;
  ticketUrl: string | null;
  category: string | null;
};

type EventCardListProps = {
  events: EventItem[];
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

export function EventCardList({
  events,
  isLoading,
  selectedEventId,
  onEventHover,
  activeTimeFilter,
  feedParams,
}: EventCardListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll to selected card when selectedEventId changes (e.g. map marker clicked)
  useEffect(() => {
    if (!selectedEventId) return;
    const cardEl = cardRefs.current[selectedEventId];
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedEventId]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <EventCardSkeleton />
        <EventCardSkeleton />
        <EventCardSkeleton />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="text-5xl mb-4">🌙</div>
        <h3 className="text-lg font-bold text-white mb-2">Nothing found</h3>
        <p className="text-sm text-zinc-500">
          {activeTimeFilter === "Tonight"
            ? "Try looking at the next few days, or clear your filters."
            : "Try a different time range or clearing your filters."}
        </p>
      </div>
    );
  }

  // Build the href for each event card. Including the current feed params as a
  // query string on the detail URL means browser back-navigation returns to
  // /feed?<those params>, so filters are fully restored.
  const buildEventHref = (id: string) => {
    const base = `/feed/${id}`;
    return feedParams ? `${base}?${feedParams}` : base;
  };

  return (
    <div ref={listRef} className="flex flex-col gap-3 p-4 stagger-children">
      {events.map((event) => (
        <div
          key={event.id}
          ref={(el) => { cardRefs.current[event.id] = el; }}
        >
          <Link href={buildEventHref(event.id)} className="block">
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
              isSelected={selectedEventId === event.id}
              onHover={onEventHover}
            />
          </Link>
        </div>
      ))}
    </div>
  );
}
