"use client";

import React, { type CSSProperties } from "react";
import { CATEGORIES } from "@/lib/utils/categoryConfig";

type CategoryFiltersProps = {
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  availableCategories: string[];
};

export function CategoryFilters({ activeCategory, onCategoryChange, availableCategories }: CategoryFiltersProps) {
  const availableCategorySet = new Set(availableCategories);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-fade-right pb-1 -mx-1 px-1" role="group" aria-label="Category">
      <button
        onClick={() => onCategoryChange(null)}
        aria-pressed={activeCategory === null}
        className={`whitespace-nowrap px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors shrink-0 border ${
          activeCategory === null
            ? "bg-moon text-ink border-moon"
            : "text-haze border-seam hover:text-moon hover:border-haze"
        }`}
      >
        Everything
      </button>

      {CATEGORIES.filter((category) => category.id !== "other").map((category) => {
        const isActive = activeCategory === category.id;
        const hasEvents = availableCategorySet.size === 0 || availableCategorySet.has(category.id);
        // Active chips fill with the category's line color, like a subway bullet.
        const chipStyle = {
          "--bullet-color": isActive ? "var(--ink)" : category.hex,
          ...(isActive ? { backgroundColor: category.hex, borderColor: category.hex } : {}),
        } as CSSProperties;

        return (
          <button
            key={category.id}
            onClick={() => hasEvents && onCategoryChange(isActive ? null : category.id)}
            disabled={!hasEvents}
            aria-pressed={isActive}
            style={chipStyle}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors shrink-0 border ${
              isActive
                ? "text-ink"
                : hasEvents
                  ? "text-haze border-seam hover:text-moon hover:border-haze"
                  : "text-dim border-seam/50 opacity-40 cursor-not-allowed"
            }`}
          >
            <span className="line-bullet w-2! h-2!" aria-hidden="true" />
            {category.label}
          </button>
        );
      })}
    </div>
  );
}
