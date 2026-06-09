"use client";

import React from "react";
import { CATEGORIES } from "@/lib/utils/categoryConfig";

type CategoryFiltersProps = {
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  availableCategories: string[];
};

export function CategoryFilters({ activeCategory, onCategoryChange, availableCategories }: CategoryFiltersProps) {
  const availableSet = new Set(availableCategories);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-fade-right pb-1">
      {/* "All" pill */}
      <button
        onClick={() => onCategoryChange(null)}
        className={`flex items-center gap-1 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 ${
          activeCategory === null
            ? "bg-white text-black shadow-md"
            : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800"
        }`}
      >
        ✨ All
      </button>

      {CATEGORIES.filter((cat) => cat.id !== "other").map((cat) => {
        const isActive = activeCategory === cat.id;
        const hasEvents = availableSet.size === 0 || availableSet.has(cat.id);
        return (
          <button
            key={cat.id}
            onClick={() => hasEvents ? onCategoryChange(isActive ? null : cat.id) : undefined}
            disabled={!hasEvents}
            className={`flex items-center gap-1 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 border ${
              isActive
                ? "bg-white text-black border-transparent shadow-md"
                : hasEvents
                  ? "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border-zinc-800"
                  : "bg-zinc-900/40 text-zinc-700 border-zinc-900 cursor-not-allowed opacity-40"
            }`}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        );
      })}
    </div>
  );
}
