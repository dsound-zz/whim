"use client";

import React from "react";
import { formatPrice } from "@/lib/utils/formatPrice";

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

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-gray-900 border-t border-gray-800 rounded-t-3xl shadow-2xl transform transition-transform duration-300 translate-y-0">
        <div className="max-w-md mx-auto p-5">
          {/* Handle */}
          <div className="w-12 h-1.5 bg-gray-700 rounded-full mx-auto mb-5" />

          {/* Header Row */}
          <div className="flex justify-between items-start gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-white mb-1 line-clamp-2">
                {event.title}
              </h2>
              <p className="text-gray-400 font-medium text-sm">
                {event.venueName}
              </p>
            </div>

            {/* Favorite Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite();
              }}
              className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors shrink-0"
              aria-label="Toggle favorite"
            >
              <svg
                className={`w-6 h-6 transition-colors ${
                  isFavorite ? "text-pink-500 fill-current" : "text-gray-400"
                }`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
            </button>
          </div>

          {/* Metadata */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center text-gray-300 text-sm">
              <span className="w-6 opacity-70">🗓</span>
              <span>{dateStr}</span>
            </div>
            <div className="flex items-center text-gray-300 text-sm">
              <span className="w-6 opacity-70">🎟</span>
              <span>{priceTag}</span>
            </div>
          </div>

          {/* Get Tickets Button */}
          {event.ticketUrl ? (
            <a
              href={event.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-center font-bold rounded-xl transition-colors shadow-lg shadow-blue-900/20"
            >
              Get Tickets
            </a>
          ) : (
            <div className="w-full py-3.5 px-4 bg-gray-800 text-gray-500 text-center font-bold rounded-xl cursor-not-allowed">
              Tickets Unavailable
            </div>
          )}
        </div>
      </div>
    </>
  );
}
