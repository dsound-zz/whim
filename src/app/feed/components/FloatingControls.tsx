"use client";

import React from "react";

type FilterType = "Tonight" | "Next 2 Days" | "This Week";

export default function FloatingControls({
  activeFilter,
  setActiveFilter,
}: {
  activeFilter: FilterType;
  setActiveFilter: (filter: FilterType) => void;
}) {
  const filters: FilterType[] = ["Tonight", "Next 2 Days", "This Week"];

  return (
    <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-6 pb-2 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto flex flex-col gap-3">
        {/* Search Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            className="w-full bg-gray-900/80 backdrop-blur-md border border-gray-700 text-white text-sm rounded-full focus:ring-blue-500 focus:border-blue-500 block pl-10 p-3 shadow-lg outline-none"
            placeholder="Search events, venues..."
          />
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors shadow-md ${
                activeFilter === filter
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800/80 backdrop-blur-md text-gray-300 hover:bg-gray-700"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
