'use client';

import { useState, useEffect } from 'react';
import {
  fetchCoordFlaggedLogsAction,
  acceptCorrectionAction,
} from './actions';
import type { CoordFlaggedLog } from './actions';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default function CoordinateAuditTab() {
  const [coordLogs, setCoordLogs] = useState<CoordFlaggedLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCoordFlaggedLogsAction().then((logs) => {
      setCoordLogs(logs);
      setIsLoading(false);
    });
  }, []);

  async function handleAcceptCorrection(log: CoordFlaggedLog) {
    if (log.mapboxLat === null || log.mapboxLng === null) return;

    setAcceptingIds((previous) => new Set(previous).add(log.eventId));
    try {
      await acceptCorrectionAction(log.eventId, log.mapboxLat, log.mapboxLng);
      setAcceptedIds((previous) => new Set(previous).add(log.eventId));
    } catch {
      // Error is logged server-side; keep the row visible so the user can retry.
    } finally {
      setAcceptingIds((previous) => {
        const next = new Set(previous);
        next.delete(log.eventId);
        return next;
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
        <span className="ml-3 text-sm text-zinc-500">
          Loading coordinate audit logs…
        </span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Coordinate Audit</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          Verification logs where stored coordinates deviate {'>'} 500m from a fresh
          Mapbox geocode •{' '}
          <span className="text-zinc-300 font-medium tabular-nums">
            {coordLogs.length}
          </span>{' '}
          flagged
        </p>
      </div>

      {coordLogs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <div className="text-3xl mb-3">📍</div>
          <p className="text-zinc-400 font-medium">No coordinate flags</p>
          <p className="text-zinc-600 text-sm mt-1">
            Run a verification check to scan events for coordinate drift.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-900/80 border-b border-zinc-800">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Event
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Venue
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">
                    Delta
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Stored
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Mapbox Suggested
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Reason
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Checked
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {coordLogs.map((log) => {
                  const isAccepted = acceptedIds.has(log.eventId);
                  const isAccepting = acceptingIds.has(log.eventId);
                  const hasMapboxCoords =
                    log.mapboxLat !== null && log.mapboxLng !== null;

                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors ${
                        isAccepted
                          ? 'bg-emerald-950/20'
                          : 'hover:bg-zinc-800/30'
                      }`}
                    >
                      <td className="px-5 py-3 max-w-xs">
                        <span className="text-zinc-200 font-medium line-clamp-1">
                          {log.eventTitle}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-400 max-w-xs">
                        <span className="line-clamp-1">
                          {log.eventVenueName ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span className="text-red-400 font-semibold">
                          {log.coordDeltaMeters !== null
                            ? `${Math.round(log.coordDeltaMeters).toLocaleString()}m`
                            : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-500 tabular-nums text-xs">
                        {log.storedLat !== null && log.storedLng !== null
                          ? `${log.storedLat.toFixed(4)}, ${log.storedLng.toFixed(4)}`
                          : '—'}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-xs">
                        {hasMapboxCoords ? (
                          <span className="text-blue-400">
                            {log.mapboxLat!.toFixed(4)}, {log.mapboxLng!.toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-400 max-w-xs">
                        <span className="line-clamp-1 text-xs">
                          {log.mismatchReason ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-500 tabular-nums whitespace-nowrap text-xs">
                        {dateFormatter.format(new Date(log.checkedAt))}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isAccepted ? (
                          <span className="text-xs text-emerald-400 font-medium">
                            ✓ Accepted
                          </span>
                        ) : hasMapboxCoords ? (
                          <button
                            onClick={() => handleAcceptCorrection(log)}
                            disabled={isAccepting}
                            className="px-3 py-1 rounded-md bg-blue-900/30 border border-blue-800/50 text-blue-300 text-xs font-medium hover:bg-blue-800/40 hover:border-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isAccepting ? 'Applying…' : 'Accept Correction'}
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-600">
                            No suggestion
                          </span>
                        )}
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
