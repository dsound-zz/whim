"use client";

import { AdminEvent } from "./types";
import { getSourceMeta } from "@/lib/utils/sourceColors";

export default function StatsBar({ events }: { events: AdminEvent[] }) {
  const total = events.length;
  const missingGeo   = events.filter((e) => e.lat === null || e.lng === null).length;
  const missingImage = events.filter((e) => !e.imageUrl).length;
  const drafts       = events.filter((e) => e.status === "draft").length;

  const sourceCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.sourceType] = (acc[e.sourceType] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-wrap items-center gap-4 bg-zinc-950 border-b border-zinc-800 px-5 py-3 shrink-0 text-sm">
      {/* Total */}
      <div className="flex flex-col">
        <span className="text-zinc-500 text-[10px] uppercase tracking-wide font-medium">Total</span>
        <span className="text-white text-xl font-mono tabular-nums">{total}</span>
      </div>

      <div className="h-8 w-px bg-zinc-800" />

      {/* Source breakdown pills */}
      <div className="flex flex-col">
        <span className="text-zinc-500 text-[10px] uppercase tracking-wide font-medium mb-1">Sources</span>
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(sourceCounts).map(([src, count]) => {
            const meta = getSourceMeta(src);
            return (
              <div
                key={src}
                className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${meta.idleBg} ${meta.idleText} ${meta.idleBorder}`}
              >
                {meta.abbr}: {count}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right-side indicators */}
      <div className="ml-auto flex items-center gap-5">
        <div className="flex flex-col items-end">
          <span className="text-zinc-500 text-[10px] uppercase tracking-wide font-medium">Pending</span>
          <span className={drafts > 0 ? "text-indigo-400 font-mono text-xl tabular-nums" : "text-zinc-600 font-mono text-xl tabular-nums"}>
            {drafts}
          </span>
        </div>
        <div className="h-8 w-px bg-zinc-800" />
        <div className="flex flex-col items-end">
          <span className="text-zinc-500 text-[10px] uppercase tracking-wide font-medium">No Image</span>
          <span className={missingImage > 0 ? "text-amber-400 font-mono text-xl tabular-nums" : "text-zinc-600 font-mono text-xl tabular-nums"}>
            {missingImage}
          </span>
        </div>
        <div className="h-8 w-px bg-zinc-800" />
        <div className="flex flex-col items-end">
          <span className="text-zinc-500 text-[10px] uppercase tracking-wide font-medium">No Geo</span>
          <span className={missingGeo > 0 ? "text-red-400 font-mono text-xl tabular-nums" : "text-zinc-600 font-mono text-xl tabular-nums"}>
            {missingGeo}
          </span>
        </div>
      </div>
    </div>
  );
}
