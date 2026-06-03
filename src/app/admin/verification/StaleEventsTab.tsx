'use client';

import { useState, useEffect } from 'react';
import { fetchStaleEventsAction, expireStaleEventsAction } from './actions';
import type { StaleEventRow } from '@/types/audit';

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

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default function StaleEventsTab() {
  const [staleEvents, setStaleEvents] = useState<StaleEventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpiring, setIsExpiring] = useState(false);
  const [expireAllArmed, setExpireAllArmed] = useState(false);
  const [expiringEventIds, setExpiringEventIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchStaleEventsAction().then((rows) => {
      setStaleEvents(rows);
      setIsLoading(false);
    });
  }, []);

  async function handleExpireSingle(eventId: string) {
    setExpiringEventIds((previous) => new Set(previous).add(eventId));
    try {
      await expireStaleEventsAction([eventId]);
      setStaleEvents((previous) => previous.filter((event) => event.id !== eventId));
    } finally {
      setExpiringEventIds((previous) => {
        const next = new Set(previous);
        next.delete(eventId);
        return next;
      });
    }
  }

  async function handleExpireAll() {
    if (!expireAllArmed) {
      setExpireAllArmed(true);
      setTimeout(() => setExpireAllArmed(false), 4000);
      return;
    }

    setIsExpiring(true);
    setExpireAllArmed(false);
    try {
      const allIds = staleEvents.map((event) => event.id);
      await expireStaleEventsAction(allIds);
      setStaleEvents([]);
    } finally {
      setIsExpiring(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
        <span className="ml-3 text-sm text-zinc-500">Loading stale events…</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Stale Events</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Active events whose start/end dates have already passed •{' '}
            <span className="text-zinc-300 font-medium tabular-nums">
              {staleEvents.length}
            </span>{' '}
            found
          </p>
        </div>
        {staleEvents.length > 0 && (
          <button
            onClick={handleExpireAll}
            disabled={isExpiring}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              expireAllArmed
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
            }`}
          >
            {isExpiring ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Expiring…
              </>
            ) : expireAllArmed ? (
              '⚠ Click again to confirm'
            ) : (
              `Expire All (${staleEvents.length})`
            )}
          </button>
        )}
      </div>

      {/* Table */}
      {staleEvents.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <div className="text-3xl mb-3">✓</div>
          <p className="text-zinc-400 font-medium">No stale events found</p>
          <p className="text-zinc-600 text-sm mt-1">
            All active events have future start dates.
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
                    Start Date
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {staleEvents.map((event) => (
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
                    <td className="px-5 py-3 text-zinc-400 tabular-nums whitespace-nowrap">
                      {dateFormatter.format(new Date(event.startAt))}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-300">
                        Stale
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleExpireSingle(event.id)}
                        disabled={expiringEventIds.has(event.id)}
                        className="px-3 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium hover:bg-red-900/40 hover:border-red-800 hover:text-red-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {expiringEventIds.has(event.id) ? 'Expiring…' : 'Expire'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
