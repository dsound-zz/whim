'use client';

import { useState, useEffect } from 'react';
import { fetchMissingDataAction } from './actions';
import type { IncompleteEventRow } from '@/types/audit';

const SOURCE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  ticketmaster_api: { bg: 'bg-blue-900/40', text: 'text-blue-300' },
  eventbrite_api: { bg: 'bg-purple-900/40', text: 'text-purple-300' },
  dice_scrape: { bg: 'bg-pink-900/40', text: 'text-pink-300' },
  seatgeek_api: { bg: 'bg-cyan-900/40', text: 'text-cyan-300' },
  songkick_scrape: { bg: 'bg-amber-900/40', text: 'text-amber-300' },
  nyc_parks_api: { bg: 'bg-green-900/40', text: 'text-green-300' },
  direct_submission: { bg: 'bg-emerald-900/40', text: 'text-emerald-300' },
};

function formatSourceLabel(sourceType: string): string {
  return sourceType
    .replace(/_api$/, '')
    .replace(/_scrape$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getSourceBadgeClasses(sourceType: string): string {
  const colors = SOURCE_BADGE_COLORS[sourceType] ?? {
    bg: 'bg-zinc-800/60',
    text: 'text-zinc-400',
  };
  return `${colors.bg} ${colors.text}`;
}

const FILTER_OPTIONS = [
  { label: 'All Missing', value: 'all' },
  { label: 'Missing Image', value: 'image' },
  { label: 'Missing Description', value: 'description' },
  { label: 'Missing Coords', value: 'coords' },
  { label: 'Missing Category', value: 'category' },
] as const;

type FilterValue = (typeof FILTER_OPTIONS)[number]['value'];

function MissingFieldBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-900/30 text-red-400 border border-red-900/30">
      {label}
    </span>
  );
}

export default function DataCompletenessTab() {
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const [incompleteEvents, setIncompleteEvents] = useState<IncompleteEventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetchMissingDataAction(activeFilter).then((rows) => {
      setIncompleteEvents(rows);
      setIsLoading(false);
    });
  }, [activeFilter]);

  function getMissingFields(event: IncompleteEventRow): string[] {
    const missing: string[] = [];
    if (!event.imageUrl) missing.push('Image');
    if (!event.description) missing.push('Description');
    if (event.lat === null || event.lng === null) missing.push('Coordinates');
    if (!event.category) missing.push('Category');
    return missing;
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header + filter pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Data Completeness</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Active events with missing critical fields
          </p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => setActiveFilter(option.value)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeFilter === option.value
                ? 'bg-white text-black shadow-sm'
                : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800'
            }`}
          >
            {option.label}
          </button>
        ))}

        {!isLoading && (
          <span className="ml-3 text-xs text-zinc-600 tabular-nums">
            {incompleteEvents.length} result{incompleteEvents.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <span className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          <span className="ml-3 text-sm text-zinc-500">Loading…</span>
        </div>
      ) : incompleteEvents.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <div className="text-3xl mb-3">✓</div>
          <p className="text-zinc-400 font-medium">All clear</p>
          <p className="text-zinc-600 text-sm mt-1">
            No events are missing the selected fields.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-900/80 border-b border-zinc-800">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Title
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Venue
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Source
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Missing Fields
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {incompleteEvents.map((event) => {
                  const missingFields = getMissingFields(event);
                  return (
                    <tr
                      key={event.id}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-5 py-3 max-w-xs">
                        <span className="text-zinc-200 font-medium line-clamp-1">
                          {event.title}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-400 max-w-xs">
                        <span className="line-clamp-1">
                          {event.venueName ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getSourceBadgeClasses(event.sourceType)}`}
                        >
                          {formatSourceLabel(event.sourceType)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {missingFields.map((field) => (
                            <MissingFieldBadge key={field} label={field} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
