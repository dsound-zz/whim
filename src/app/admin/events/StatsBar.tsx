"use client";

import { AdminEvent } from "./types";

const getSourceColor = (source: string) => {
  switch (source) {
    case 'ticketmaster_api': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'dice_scrape': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'eventbrite_api': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'ical': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'email': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

export default function StatsBar({ events }: { events: AdminEvent[] }) {
  const total = events.length;
  const missingGeo = events.filter(e => e.lat === null || e.lng === null).length;
  const inactive = events.filter(e => e.status === 'cancelled' || e.status === 'expired').length;

  const sourceCounts = events.reduce((acc, e) => {
    acc[e.sourceType] = (acc[e.sourceType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-wrap items-center gap-4 bg-gray-900 border-b border-gray-800 p-4 shrink-0 text-sm">
      <div className="flex flex-col">
        <span className="text-gray-500 font-medium mb-1">Total Events</span>
        <span className="text-white text-xl font-mono">{total}</span>
      </div>
      <div className="h-8 w-px bg-gray-800 mx-2"></div>
      
      <div className="flex flex-col">
        <span className="text-gray-500 font-medium mb-1">Sources</span>
        <div className="flex gap-2">
          {Object.entries(sourceCounts).map(([src, count]) => (
            <div key={src} className={`px-2 py-0.5 rounded-md border text-xs font-semibold ${getSourceColor(src)}`}>
              {src.replace('_api', '').replace('_scrape', '').toUpperCase()}: {count}
            </div>
          ))}
        </div>
      </div>
      
      <div className="h-8 w-px bg-gray-800 mx-2 ml-auto"></div>
      <div className="flex flex-col items-end">
        <span className="text-gray-500 font-medium mb-1">Missing Geo</span>
        <span className={missingGeo > 0 ? "text-red-400 font-mono text-xl" : "text-gray-400 font-mono text-xl"}>{missingGeo}</span>
      </div>
      <div className="flex flex-col items-end pl-4 border-l border-gray-800">
        <span className="text-gray-500 font-medium mb-1">Inactive/Cancelled</span>
        <span className={inactive > 0 ? "text-orange-400 font-mono text-xl" : "text-gray-400 font-mono text-xl"}>{inactive}</span>
      </div>
    </div>
  );
}
