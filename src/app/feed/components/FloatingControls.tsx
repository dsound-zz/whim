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
  isLoading: boolean;
  viewMode?: "list" | "map";
  onViewModeToggle?: () => void;
};

const TIME_FILTERS: TimeFilter[] = ["Tonight", "Next 2 Days", "This Week"];

const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  "Tonight": "Tonight",
  "Next 2 Days": "Next 2 days",
  "This Week": "This week",
};

const HEADLINES: Record<TimeFilter, string> = {
  "Tonight": "Tonight in New York",
  "Next 2 Days": "The next two days",
  "This Week": "This week in New York",
};

export function FeedHeader({
  activeFilter,
  onFilterChange,
  activeCategory,
  onCategoryChange,
  availableCategories,
  searchQuery,
  onSearchChange,
  resultCount,
  isLoading,
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

  const handleKeyDown = (keyboardEvent: React.KeyboardEvent<HTMLInputElement>) => {
    if (keyboardEvent.key === "Enter") {
      keyboardEvent.preventDefault();
      commitSearch();
    } else if (keyboardEvent.key === "Escape") {
      clearSearch();
    }
  };

  const shouldShowClearButton = inputValue.length > 0 || searchQuery.length > 0;
  const resultCountLabel = isLoading
    ? "Checking the board…"
    : `${resultCount} event${resultCount !== 1 ? "s" : ""}${searchQuery ? ` matching “${searchQuery}”` : ""}`;

  return (
    <div className="flex flex-col gap-4 px-4 sm:px-5 pt-5 pb-3 bg-ink border-b border-seam shrink-0">

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="type-headline text-[1.85rem] leading-[1.05] text-moon">
            {HEADLINES[activeFilter]}
          </h1>
          <p className="mt-1 text-sm text-haze" aria-live="polite">{resultCountLabel}</p>
        </div>

        {onViewModeToggle && (
          <button
            onClick={onViewModeToggle}
            className="lg:hidden shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md border border-seam text-sm font-semibold text-moon hover:bg-ink-raised transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7" />
            </svg>
            {viewMode === "map" ? "List" : "Map"}
          </button>
        )}
      </div>

      <div className="relative">
        <button
          onClick={commitSearch}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-dim hover:text-haze transition-colors"
          aria-label="Search"
          tabIndex={-1}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        <input
          ref={inputRef}
          type="search"
          value={inputValue}
          onChange={(changeEvent) => setInputValue(changeEvent.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search an artist, venue or neighborhood"
          aria-label="Search events"
          className="w-full bg-ink-sunken border border-seam text-moon text-sm rounded-md pl-9 pr-9 py-2.5 outline-none focus:border-haze transition-colors placeholder:text-dim [&::-webkit-search-cancel-button]:hidden"
        />

        {shouldShowClearButton && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-moon transition-colors"
            aria-label="Clear search"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Time range — a segmented control; sodium marks the chosen window */}
      <div className="flex items-stretch border-b border-seam -mb-1" role="group" aria-label="Time range">
        {TIME_FILTERS.map((filter, filterIndex) => {
          const isActive = activeFilter === filter;
          const isFirst = filterIndex === 0;
          return (
            <button
              key={filter}
              onClick={() => onFilterChange(filter)}
              aria-pressed={isActive}
              className={`relative ${isFirst ? "pr-3" : "px-3"} pb-2.5 text-sm font-semibold transition-colors ${
                isActive ? "text-sodium" : "text-haze hover:text-moon"
              }`}
            >
              {TIME_FILTER_LABELS[filter]}
              {isActive && (
                <span className={`absolute ${isFirst ? "left-0" : "left-3"} right-3 -bottom-px h-[3px] bg-sodium rounded-t-sm`} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <CategoryFilters activeCategory={activeCategory} onCategoryChange={onCategoryChange} availableCategories={availableCategories} />
    </div>
  );
}
