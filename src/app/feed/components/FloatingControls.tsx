"use client";

import React, { useEffect, useRef, useState } from "react";
import { CategoryFilters } from "./CategoryFilters";

type TimeFilter = "Tonight" | "Next 2 Days" | "This Week";

type FeedHeaderProps = {
  activeFilter: TimeFilter;
  onFilterChange: (filter: TimeFilter) => void;
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  availableCategories: string[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  resultCount: number;
  viewMode?: "list" | "map";
  onViewModeToggle?: () => void;
};

const TIME_FILTERS: TimeFilter[] = ["Tonight", "Next 2 Days", "This Week"];

export function FeedHeader({
  activeFilter,
  onFilterChange,
  activeCategory,
  onCategoryChange,
  availableCategories,
  searchQuery,
  onSearchChange,
  resultCount,
  viewMode,
  onViewModeToggle,
}: FeedHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Local draft — never pushed to URL until the user commits via Enter or icon click.
  // Syncs back from the URL on back-navigation (searchQuery prop changes).
  const [inputValue, setInputValue] = useState(searchQuery);
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  const commitSearch = () => {
    onSearchChange(inputValue.trim());
    inputRef.current?.blur();
  };

  const clearSearch = () => {
    setInputValue("");
    onSearchChange("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitSearch();
    } else if (e.key === "Escape") {
      clearSearch();
    }
  };

  const showClearButton = inputValue.length > 0 || searchQuery.length > 0;

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-3 bg-zinc-950 border-b border-zinc-900 shrink-0">

      {/* Top row: search + map toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">

          {/* Search icon — also acts as submit button */}
          <button
            onClick={commitSearch}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Submit search"
            tabIndex={-1}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search events, venues… press Enter ↵"
            className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-full pl-9 pr-8 py-2.5 outline-none focus:border-zinc-600 transition-colors placeholder:text-zinc-600"
          />

          {/* × clear button */}
          {showClearButton && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
              aria-label="Clear search"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* View toggle — mobile only */}
        {onViewModeToggle && (
          <button
            onClick={onViewModeToggle}
            className="shrink-0 p-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 transition-colors"
            aria-label={viewMode === "map" ? "Show list" : "Show map"}
          >
            {viewMode === "map" ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Time filter pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {TIME_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => onFilterChange(filter)}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 ${
              activeFilter === filter
                ? "bg-blue-600 text-white shadow-md"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Category pills */}
      <CategoryFilters activeCategory={activeCategory} onCategoryChange={onCategoryChange} availableCategories={availableCategories} />

      {/* Result count */}
      <p className="text-[11px] text-zinc-600 leading-none">
        {resultCount} event{resultCount !== 1 ? "s" : ""} found
      </p>
    </div>
  );
}
