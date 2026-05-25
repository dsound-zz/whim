"use client";

import { Dispatch, SetStateAction } from "react";

type FeedFiltersProps = {
  activeDate: string;
  setActiveDate: Dispatch<SetStateAction<string>>;
};

export function FeedFilters({ activeDate, setActiveDate }: FeedFiltersProps) {
  const tabs = [
    { id: "tonight", label: "Tonight" },
    { id: "tomorrow", label: "Tomorrow" },
    { id: "weekend", label: "This Weekend" },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveDate(tab.id)}
          className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
            activeDate === tab.id
              ? "bg-white text-black"
              : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
