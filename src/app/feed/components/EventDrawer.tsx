"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils/formatPrice";
import { describeRelativeDay, formatClockTime } from "@/lib/utils/formatEventTime";
import { CategoryBullet } from "@/components/ui/CategoryBullet";
import type { FeedEvent } from "@/types";

type EventDrawerProps = {
  event: FeedEvent | null;
  onClose: () => void;
  isFavorite: boolean;
  toggleFavorite: () => void;
};

export default function EventDrawer({ event, onClose, isFavorite, toggleFavorite }: EventDrawerProps) {
  useEffect(() => {
    if (!event) return;
    const handleEscape = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [event, onClose]);

  if (!event) return null;

  const priceTag = formatPrice(event.isFree ?? false, event.priceMin ?? null, event.priceMax ?? null, event.ticketUrl ?? null);
  const isFreeEvent = !!event.isFree || priceTag === "Free";
  const shouldShowPrice = !isFreeEvent && priceTag !== "—" && priceTag !== "View Tickets";

  return (
    <>
      <div className="fixed inset-0 z-[55] bg-ink-sunken/60" onClick={onClose} aria-hidden="true" />

      <div
        className="fixed bottom-0 inset-x-0 z-[60] bg-ink border-t border-seam rounded-t-2xl shadow-[0_-12px_40px_rgba(8,6,28,0.6)] animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-drawer-title"
      >
        <div className="max-w-lg mx-auto px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="flex justify-center pb-3" aria-hidden="true">
            <div className="w-10 h-1 bg-seam rounded-full" />
          </div>

          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <p className="type-clock text-3xl text-sodium" suppressHydrationWarning>
                {formatClockTime(event.startAt)}
              </p>
              <p className="text-sm text-haze mt-1" suppressHydrationWarning>{describeRelativeDay(event.startAt)}</p>
            </div>
            {event.imageUrl && (
              <img src={event.imageUrl} alt="" className="w-20 h-20 rounded-md object-cover shrink-0 bg-ink-raised" />
            )}
          </div>

          <h2 id="event-drawer-title" className="type-headline text-xl leading-snug text-moon mt-3 line-clamp-2">
            {event.title}
          </h2>
          <p className="text-sm text-haze mt-1">{event.venueName}</p>

          <div className="flex items-center gap-3 text-xs font-semibold text-haze mt-2.5">
            <CategoryBullet category={event.category} />
            {isFreeEvent && <span className="text-mint">Free</span>}
            {shouldShowPrice && <span className="text-moon/80">{priceTag}</span>}
          </div>

          <div className="flex gap-2 mt-5">
            {event.ticketUrl ? (
              <a
                href={event.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-3 px-4 bg-sodium hover:bg-sodium-deep text-ink text-sm text-center font-bold rounded-md transition-colors"
              >
                {isFreeEvent ? "Open event page" : "Get tickets"}
              </a>
            ) : (
              <Link
                href={`/feed/${event.id}`}
                className="flex-1 py-3 px-4 bg-sodium hover:bg-sodium-deep text-ink text-sm text-center font-bold rounded-md transition-colors"
              >
                See details
              </Link>
            )}
            {event.ticketUrl && (
              <Link
                href={`/feed/${event.id}`}
                className="py-3 px-4 border border-seam hover:bg-ink-raised text-moon text-sm font-semibold rounded-md transition-colors"
              >
                Details
              </Link>
            )}
            <button
              onClick={(clickEvent) => { clickEvent.stopPropagation(); toggleFavorite(); }}
              className="p-3 rounded-md border border-seam hover:bg-ink-raised transition-colors"
              aria-label={isFavorite ? "Remove from saved" : "Save event"}
              aria-pressed={isFavorite}
            >
              <svg
                className={`w-5 h-5 ${isFavorite ? "text-sodium fill-current" : "text-haze"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          </div>

          <button onClick={onClose} className="w-full mt-3 py-2 text-sm text-dim hover:text-haze transition-colors">
            Close
          </button>
        </div>
      </div>
    </>
  );
}
