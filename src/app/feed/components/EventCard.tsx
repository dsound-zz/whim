"use client";

import React, { useState } from "react";
import { formatPrice } from "@/lib/utils/formatPrice";
import { formatClockTimeParts } from "@/lib/utils/formatEventTime";
import { CategoryBullet } from "@/components/ui/CategoryBullet";

export type EventLiveStatus = "happening_now" | "starting_soon" | null;

type EventCardProps = {
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
  liveStatus?: EventLiveStatus;
  isSelected?: boolean;
  onHover?: (id: string | null) => void;
};

const LIVE_STATUS_LABELS: Record<Exclude<EventLiveStatus, null>, string> = {
  happening_now: "On now",
  starting_soon: "Starts soon",
};

/**
 * One line on the board: start time first, because the feed is for deciding
 * what to do in the next few hours.
 */
export function EventCard({
  id,
  title,
  venueName,
  startAt,
  imageUrl,
  priceMin,
  priceMax,
  isFree,
  ticketUrl,
  category,
  liveStatus = null,
  isSelected = false,
  onHover,
}: EventCardProps) {
  const [hasImageFailed, setHasImageFailed] = useState(false);

  const { clock, meridiem } = formatClockTimeParts(startAt);
  const priceTag = formatPrice(isFree ?? false, priceMin, priceMax, ticketUrl);
  const isFreeEvent = !!isFree || priceTag === "Free";
  const shouldShowPrice = !isFreeEvent && priceTag !== "—" && priceTag !== "View Tickets";
  const shouldShowImage = !!imageUrl && !hasImageFailed;

  return (
    <div
      className={`group relative flex gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 transition-colors ${
        isSelected ? "bg-ink-raised" : "hover:bg-ink-raised/60"
      }`}
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {isSelected && <span className="absolute left-0 inset-y-0 w-[3px] bg-sodium" aria-hidden="true" />}

      <div className="w-[3.6rem] shrink-0 flex flex-col items-start pt-0.5">
        <span className="type-clock text-[1.9rem] text-sodium">{clock}</span>
        <span className="text-xs font-semibold text-haze mt-0.5">{meridiem}</span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {liveStatus && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-sodium">
            <span className="w-1.5 h-1.5 rounded-full bg-sodium" aria-hidden="true" />
            {LIVE_STATUS_LABELS[liveStatus]}
          </span>
        )}
        <h3 className="text-base font-semibold leading-snug text-moon line-clamp-2 group-hover:underline decoration-seam underline-offset-4">
          {title}
        </h3>
        <p className="text-sm text-haze truncate">{venueName || "Venue to be announced"}</p>
        <div className="flex items-center gap-3 text-xs font-semibold text-haze mt-0.5">
          <CategoryBullet category={category} />
          {isFreeEvent && <span className="text-mint">Free</span>}
          {shouldShowPrice && <span className="text-moon/80">{priceTag}</span>}
        </div>
      </div>

      {shouldShowImage && (
        <img
          src={imageUrl!}
          alt=""
          className="w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 shrink-0 rounded-md object-cover bg-ink-raised"
          loading="lazy"
          onError={() => setHasImageFailed(true)}
        />
      )}
    </div>
  );
}
