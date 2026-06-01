"use client";

import { useEffect, useRef, useState } from "react";

/** Maps a sourceType to its color classes — kept in sync with StatsBar. */
const getSourceColor = (source: string, isActive: boolean) => {
  const activeColors: Record<string, string> = {
    ticketmaster_api: "bg-blue-500 text-white border-blue-500",
    dice_scrape:      "bg-orange-500 text-white border-orange-500",
    eventbrite_api:   "bg-red-500 text-white border-red-500",
    nyc_parks_api:    "bg-green-600 text-white border-green-600",
    songkick_scrape:  "bg-pink-500 text-white border-pink-500",
    seatgeek_api:     "bg-teal-500 text-white border-teal-500",
    ra_scrape:        "bg-yellow-500 text-black border-yellow-500",
    ical:             "bg-emerald-500 text-white border-emerald-500",
    email:            "bg-purple-500 text-white border-purple-500",
    direct_submission:"bg-lime-500 text-black border-lime-500",
  };
  const idleColors: Record<string, string> = {
    ticketmaster_api: "bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/30",
    dice_scrape:      "bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/30",
    eventbrite_api:   "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/30",
    nyc_parks_api:    "bg-green-600/15 text-green-400 border-green-600/30 hover:bg-green-600/30",
    songkick_scrape:  "bg-pink-500/15 text-pink-400 border-pink-500/30 hover:bg-pink-500/30",
    seatgeek_api:     "bg-teal-500/15 text-teal-400 border-teal-500/30 hover:bg-teal-500/30",
    ra_scrape:        "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30",
    ical:             "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30",
    email:            "bg-purple-500/15 text-purple-400 border-purple-500/30 hover:bg-purple-500/30",
    direct_submission:"bg-lime-500/15 text-lime-400 border-lime-500/30 hover:bg-lime-500/30",
  };
  const fallbackIdle = "bg-gray-500/15 text-gray-400 border-gray-500/30 hover:bg-gray-500/30";
  const fallbackActive = "bg-gray-500 text-white border-gray-500";

  return isActive
    ? (activeColors[source] ?? fallbackActive)
    : (idleColors[source] ?? fallbackIdle);
};

/** Formats a sourceType key into a short, readable label. */
function formatSourceLabel(source: string): string {
  return source
    .replace("_api", "")
    .replace("_scrape", "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEBOUNCE_MS = 300;

interface FilterBarProps {
  /** The committed search query used to actually filter events. */
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  dateFilter: "all" | "this_week" | "tonight";
  setDateFilter: (f: "all" | "this_week" | "tonight") => void;
  statusFilter: "active" | "draft";
  setStatusFilter: (s: "active" | "draft") => void;
  /** The currently selected source filter, or 'all'. */
  sourceFilter: string;
  setSourceFilter: (s: string) => void;
  /** All unique source types present in the currently-loaded event list. */
  availableSources: string[];
}

export default function FilterBar({
  searchQuery,
  setSearchQuery,
  dateFilter,
  setDateFilter,
  statusFilter,
  setStatusFilter,
  sourceFilter,
  setSourceFilter,
  availableSources,
}: FilterBarProps) {
  /**
   * Local input value — updated on every keystroke so the text field never
   * lags. The debounced effect below propagates the value to setSearchQuery
   * only after the user stops typing for DEBOUNCE_MS milliseconds.
   */
  const [inputValue, setInputValue] = useState(searchQuery);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local state in sync if the parent resets searchQuery externally
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value); // immediate — keeps the input responsive

    // Debounce: cancel any pending propagation, then schedule a new one
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearchQuery(value);
    }, DEBOUNCE_MS);
  };

  // Cancel any pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2 bg-zinc-950 px-4 py-3 shrink-0 border-b border-gray-800">
      {/* Row 1: search + dropdowns */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          id="admin-event-search"
          type="text"
          placeholder="Search title or venue…"
          value={inputValue}
          onChange={handleInputChange}
          className="bg-gray-900 border border-gray-700 text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 w-64 font-mono"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "active" | "draft")}
          className="bg-gray-900 border border-gray-700 text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="active">Active Events</option>
          <option value="draft">Pending Submissions</option>
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as "all" | "this_week" | "tonight")}
          className="bg-gray-900 border border-gray-700 text-white text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 font-mono"
        >
          <option value="all">All Dates</option>
          <option value="this_week">This Week</option>
          <option value="tonight">Tonight</option>
        </select>
      </div>

      {/* Row 2: source filter pills — only shown when there are sources to filter */}
      {availableSources.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-600 text-xs font-mono uppercase tracking-wider mr-1">
            Source:
          </span>

          {/* "All" pill */}
          <button
            id="source-filter-all"
            onClick={() => setSourceFilter("all")}
            className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${
              sourceFilter === "all"
                ? "bg-gray-200 text-gray-900 border-gray-200"
                : "bg-gray-800/50 text-gray-400 border-gray-700 hover:bg-gray-700/60"
            }`}
          >
            All
          </button>

          {/* One pill per source type */}
          {availableSources.map((source) => (
            <button
              key={source}
              id={`source-filter-${source}`}
              onClick={() =>
                setSourceFilter(sourceFilter === source ? "all" : source)
              }
              className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${getSourceColor(
                source,
                sourceFilter === source
              )}`}
            >
              {formatSourceLabel(source)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
