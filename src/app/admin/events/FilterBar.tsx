"use client";

import { useEffect, useRef, useState } from "react";
import { getSourceMeta, ALL_SOURCE_TYPES } from "@/lib/utils/sourceColors";

const DEBOUNCE_MS = 300;

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  dateFilter: "all" | "this_week" | "tonight";
  setDateFilter: (f: "all" | "this_week" | "tonight") => void;
  statusFilter: "active" | "draft" | "all";
  setStatusFilter: (s: "active" | "draft" | "all") => void;
  sourceFilter: string;
  setSourceFilter: (s: string) => void;
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
  const [inputValue, setInputValue] = useState(searchQuery);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInputValue(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setSearchQuery(value), DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2 bg-zinc-950 px-4 py-3 shrink-0 border-b border-zinc-800">
      {/* Row 1: search + dropdowns */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          id="admin-event-search"
          type="text"
          placeholder="Search title or venue…"
          value={inputValue}
          onChange={handleInputChange}
          className="bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 w-64 font-mono transition-colors"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "active" | "draft" | "all")}
          className="bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          <option value="all">All Events</option>
          <option value="active">Active Only</option>
          <option value="draft">Pending Submissions</option>
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as "all" | "this_week" | "tonight")}
          className="bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          <option value="all">All Dates</option>
          <option value="this_week">This Week</option>
          <option value="tonight">Tonight</option>
        </select>
      </div>

      {/* Row 2: source filter pills */}
      {availableSources.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-zinc-600 text-[10px] font-mono uppercase tracking-wider mr-1">
            Source:
          </span>
          <button
            id="source-filter-all"
            onClick={() => setSourceFilter("all")}
            className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${
              sourceFilter === "all"
                ? "bg-zinc-200 text-zinc-900 border-zinc-200"
                : "bg-zinc-800/50 text-zinc-400 border-zinc-700 hover:bg-zinc-700/60"
            }`}
          >
            All
          </button>
          {availableSources.map((source) => {
            const meta = getSourceMeta(source);
            const isActive = sourceFilter === source;
            return (
              <button
                key={source}
                id={`source-filter-${source}`}
                onClick={() => setSourceFilter(isActive ? "all" : source)}
                className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? `${meta.activeBg} ${meta.activeText} border-transparent`
                    : `${meta.idleBg} ${meta.idleText} ${meta.idleBorder} hover:opacity-80`
                }`}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
