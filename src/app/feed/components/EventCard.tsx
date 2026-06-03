"use client";

import React, { useState } from "react";
import { formatPrice } from "@/lib/utils/formatPrice";
import { getCategoryConfig, getCategoryGradient, getCategoryBadgeClasses } from "@/lib/utils/categoryConfig";

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
  isSelected?: boolean;
  onHover?: (id: string | null) => void;
};

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
  isSelected = false,
  onHover,
}: EventCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const dateObj = typeof startAt === "string" ? new Date(startAt) : startAt;

  // Relative day label
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(dateObj);
  eventDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((eventDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const dayStr =
    diffDays === 0 ? "Tonight" :
    diffDays === 1 ? "Tomorrow" :
    dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const timeStr = dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const priceTag = formatPrice(isFree ?? false, priceMin, priceMax, ticketUrl);
  const catConfig = getCategoryConfig(category);
  const gradient = getCategoryGradient(category);
  const badgeClasses = getCategoryBadgeClasses(category);
  const isFreeEvent = isFree || priceTag === "Free";

  const showImage = !!imageUrl && !imgFailed;

  return (
    <div
      className={`flex flex-col rounded-xl overflow-hidden bg-zinc-950 border transition-all duration-150 cursor-pointer card-hover ${
        isSelected
          ? "border-blue-500 card-selected"
          : "border-zinc-800 hover:border-zinc-700"
      }`}
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Image / Fallback gradient */}
      <div className="relative w-full aspect-video overflow-hidden">
        {showImage ? (
          <img
            src={imageUrl!}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          /* Gradient fallback with large emoji category icon centered */
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <span className="text-5xl opacity-40 select-none">{catConfig.emoji}</span>
          </div>
        )}

        {/* Free badge — top left */}
        {isFreeEvent && (
          <div className="absolute top-2.5 left-2.5 bg-emerald-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase">
            Free
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-1.5">
        {/* Time + category badge row */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-zinc-500 shrink-0">
            {dayStr} · {timeStr}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${badgeClasses}`}>
            {catConfig.emoji} {catConfig.label}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-white leading-snug line-clamp-2 mt-0.5">
          {title}
        </h3>

        {/* Venue */}
        <p className="text-sm text-zinc-400 truncate">
          {venueName || "Unknown Venue"}
        </p>

        {/* Price — only show if not free (free has badge already) */}
        {!isFreeEvent && priceTag && priceTag !== "—" && (
          <p className="text-xs font-semibold text-zinc-400 mt-0.5">{priceTag}</p>
        )}
      </div>
    </div>
  );
}

