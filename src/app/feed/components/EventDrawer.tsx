"use client";

import React from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils/formatPrice";
import { getCategoryConfig, getCategoryGradient, getCategoryBadgeClasses } from "@/lib/utils/categoryConfig";

export default function EventDrawer({
  event,
  onClose,
  isFavorite,
  toggleFavorite,
}: {
  event: any | null;
  onClose: () => void;
  isFavorite: boolean;
  toggleFavorite: () => void;
}) {
  if (!event) return null;

  const dateStr = new Date(event.startAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const priceTag = formatPrice(
    event.isFree ?? false,
    event.priceMin ?? null,
    event.priceMax ?? null,
    event.ticketUrl ?? null
  );

  const catConfig = getCategoryConfig(event.category);
  const gradient = getCategoryGradient(event.category);
  const badgeClasses = getCategoryBadgeClasses(event.category);
  const isFreeEvent = event.isFree || priceTag === "Free";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-950 border-t border-zinc-800 rounded-t-3xl shadow-2xl animate-slide-up">
        <div className="max-w-lg mx-auto">
          {/* Pull handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-zinc-700 rounded-full" />
          </div>

          {/* Image + close row */}
          <div className="relative">
            {event.imageUrl ? (
              <img
                src={event.imageUrl}
                alt={event.title}
                className="w-full h-40 object-cover"
              />
            ) : (
              <div className={`w-full h-32 bg-gradient-to-br ${gradient}`} />
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 bg-black/60 backdrop-blur-sm rounded-full text-white hover:bg-black/80 transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Category badge */}
            <span className={`absolute bottom-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-full border backdrop-blur-sm ${badgeClasses}`}>
              {catConfig.emoji} {catConfig.label}
            </span>

            {/* Free badge */}
            {isFreeEvent && (
              <span className="absolute bottom-3 right-3 bg-emerald-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase">
                Free
              </span>
            )}
          </div>

          {/* Content */}
          <div className="px-5 pt-4 pb-5">
            {/* Title + favorite row */}
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="text-lg font-bold text-white leading-snug line-clamp-2 flex-1">
                {event.title}
              </h2>
              <button
                onClick={(e) => { e.stopPropagation(); toggleFavorite(); }}
                className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 transition-colors shrink-0 mt-0.5"
                aria-label="Toggle favorite"
              >
                <svg
                  className={`w-5 h-5 transition-colors ${isFavorite ? "text-pink-500 fill-current" : "text-zinc-500"}`}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            </div>

            {/* Venue */}
            <p className="text-sm text-zinc-400 mb-3">{event.venueName}</p>

            {/* Meta */}
            <div className="flex items-center gap-4 text-sm text-zinc-400 mb-4">
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {dateStr}
              </span>
              {!isFreeEvent && priceTag && priceTag !== "—" && (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                  {priceTag}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {event.ticketUrl ? (
                <a
                  href={event.ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white text-sm text-center font-bold rounded-xl transition-colors"
                >
                  Get Tickets
                </a>
              ) : (
                <div className="flex-1 py-3 px-4 bg-zinc-900 text-zinc-600 text-sm text-center font-bold rounded-xl cursor-not-allowed">
                  Tickets Unavailable
                </div>
              )}
              <Link
                href={`/feed/${event.id}`}
                className="py-3 px-4 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
              >
                Details
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
