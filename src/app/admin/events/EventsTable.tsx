"use client";

import { AdminEvent } from "./types";
import { formatPrice } from "@/lib/utils/formatPrice";

const getSourceAbbr = (source: string) => {
  if (source.includes('ticketmaster')) return 'TM';
  if (source.includes('seatgeek')) return 'SG';
  if (source.includes('dice')) return 'DICE';
  if (source.includes('ra_scrape')) return 'RA';
  if (source.includes('eventbrite')) return 'EB';
  if (source.includes('nyc_parks')) return 'PARKS';
  if (source.includes('songkick')) return 'SK';
  if (source.includes('ical')) return 'ICAL';
  if (source.includes('email')) return 'EMAIL';
  return 'OTH';
};

const getSourceColor = (source: string) => {
  if (source.includes('ticketmaster')) return 'bg-blue-900 text-blue-300';
  if (source.includes('seatgeek')) return 'bg-teal-900 text-teal-300';
  if (source.includes('dice')) return 'bg-orange-900 text-orange-300';
  if (source.includes('ra_scrape')) return 'bg-fuchsia-900 text-fuchsia-300';
  if (source.includes('eventbrite')) return 'bg-red-900 text-red-300';
  if (source.includes('nyc_parks')) return 'bg-green-700 text-green-100';
  if (source.includes('songkick')) return 'bg-pink-700 text-pink-100';
  return 'bg-gray-800 text-gray-300';
};

export default function EventsTable({ 
  events, 
  onRowClick,
  selectedEventId
}: { 
  events: AdminEvent[];
  onRowClick: (event: AdminEvent) => void;
  selectedEventId: string | null;
}) {
  return (
    <div className="flex-1 overflow-auto bg-zinc-950 border-l border-gray-800">
      <table className="w-full text-left text-sm text-gray-400">
        <thead className="sticky top-0 bg-gray-900 text-xs uppercase text-gray-500 border-b border-gray-800 z-10 font-mono">
          <tr>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Event</th>
            <th className="px-4 py-3">Venue</th>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Price</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {events.map((evt) => (
            <tr 
              key={evt.id} 
              onClick={() => onRowClick(evt)}
              className={`cursor-pointer hover:bg-gray-800 transition-colors ${selectedEventId === evt.id ? 'bg-gray-800' : ''}`}
            >
              <td className="px-4 py-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getSourceColor(evt.sourceType)}`}>
                  {getSourceAbbr(evt.sourceType)}
                </span>
              </td>
              <td className="px-4 py-2 text-gray-200 font-medium truncate max-w-[200px]" title={evt.title}>
                <div>{evt.title}</div>
                {evt.moreDates && evt.moreDates > 0 ? (
                  <div className="text-xs text-gray-500 mt-0.5">+{evt.moreDates} more dates</div>
                ) : null}
              </td>
              <td className="px-4 py-2 truncate max-w-[150px]" title={evt.venueName || ''}>{evt.venueName}</td>
              <td className="px-4 py-2 whitespace-nowrap">
                {new Date(evt.startAt).toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              </td>
              <td className="px-4 py-2">
                {formatPrice(evt.isFree ?? false, evt.priceMin ?? null, evt.priceMax ?? null, evt.ticketUrl ?? null)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
