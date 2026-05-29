'use client';

import { Fragment, useState } from 'react';
import type { VerificationLog, VerificationStatus } from './types';
import { VERIFICATION_STATUS_META } from './types';

interface VerificationTableProps {
  logs: VerificationLog[];
  statusFilter: VerificationStatus | 'all';
  onStatusFilterChange: (status: VerificationStatus | 'all') => void;
}

function StatusBadge({ status }: { status: VerificationStatus }) {
  const meta = VERIFICATION_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badgeBg} ${meta.badgeText}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dotColor} shrink-0`} />
      {meta.label}
    </span>
  );
}

function ExpandedRow({ log }: { log: VerificationLog }) {
  return (
    <tr className="bg-zinc-900/60">
      <td colSpan={7} className="px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {/* Content check details */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Content Check
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 w-28 shrink-0">LLM Confirmed:</span>
              <span
                className={
                  log.llmConfirmed === true
                    ? 'text-emerald-400'
                    : log.llmConfirmed === false
                    ? 'text-red-400'
                    : 'text-zinc-500'
                }
              >
                {log.llmConfirmed === null ? 'Not checked' : log.llmConfirmed ? 'Yes' : 'No'}
              </span>
            </div>
            {log.llmReason && (
              <div className="flex gap-2">
                <span className="text-zinc-500 w-28 shrink-0">LLM Reason:</span>
                <span className="text-zinc-300">{log.llmReason}</span>
              </div>
            )}
            {log.ticketUrl && (
              <div className="flex gap-2">
                <span className="text-zinc-500 w-28 shrink-0">Ticket URL:</span>
                <a
                  href={log.ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline truncate max-w-xs"
                >
                  {log.ticketUrl}
                </a>
              </div>
            )}
          </div>

          {/* Coordinate check details */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Coordinate Check
            </h4>
            {log.coordDeltaMeters !== null ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 w-28 shrink-0">Delta:</span>
                  <span
                    className={
                      log.coordDeltaMeters > 500 ? 'text-red-400 font-semibold' : 'text-emerald-400'
                    }
                  >
                    {Math.round(log.coordDeltaMeters).toLocaleString()}m
                  </span>
                </div>
              </>
            ) : (
              <p className="text-zinc-500 text-xs">No coordinate check performed.</p>
            )}

            {log.mismatchReason && (
              <div className="flex gap-2 mt-1">
                <span className="text-zinc-500 w-28 shrink-0">Reason:</span>
                <span className="text-zinc-300">{log.mismatchReason}</span>
              </div>
            )}

            {log.errorMessage && (
              <div className="mt-2 p-2 rounded bg-red-950/40 border border-red-900/50 text-red-300 text-xs">
                {log.errorMessage}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

const STATUS_FILTER_OPTIONS: Array<{ label: string; value: VerificationStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Verified', value: 'verified' },
  { label: 'Content Flags', value: 'flagged_content' },
  { label: 'Coord Flags', value: 'flagged_coordinates' },
  { label: 'Both Flagged', value: 'flagged_both' },
  { label: 'Skipped', value: 'skipped' },
  { label: 'Errors', value: 'error' },
];

export default function VerificationTable({
  logs,
  statusFilter,
  onStatusFilterChange,
}: VerificationTableProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.eventTitle.toLowerCase().includes(query) ||
      (log.eventVenueName ?? '').toLowerCase().includes(query)
    );
  });

  function handleRowClick(logId: string) {
    setExpandedRowId((previousId) => (previousId === logId ? null : logId));
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-950 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onStatusFilterChange(option.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === option.value
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="ml-auto shrink-0">
          <input
            type="text"
            placeholder="Search events…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-48"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-700 z-10">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Event</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Venue</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Coord Δ</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">LLM</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Mismatch Reason</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Checked At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                  {logs.length === 0
                    ? 'No verification logs yet. Run a check to populate this table.'
                    : 'No results match your filters.'}
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isExpanded = expandedRowId === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr
                      onClick={() => handleRowClick(log.id)}
                      className={`cursor-pointer transition-colors ${
                        isExpanded ? 'bg-zinc-900' : 'hover:bg-zinc-900/50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <span className="text-zinc-100 font-medium line-clamp-1">
                          {log.eventTitle}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 max-w-xs line-clamp-1">
                        {log.eventVenueName ?? '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {log.coordDeltaMeters !== null ? (
                          <span
                            className={
                              log.coordDeltaMeters > 500
                                ? 'text-red-400 font-semibold'
                                : 'text-emerald-400'
                            }
                          >
                            {Math.round(log.coordDeltaMeters)}m
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {log.llmConfirmed === null ? (
                          <span className="text-zinc-600">—</span>
                        ) : log.llmConfirmed ? (
                          <span className="text-emerald-400">✓</span>
                        ) : (
                          <span className="text-red-400">✗</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 max-w-sm">
                        <span className="line-clamp-1">{log.mismatchReason ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 tabular-nums whitespace-nowrap">
                        {new Intl.DateTimeFormat('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(log.checkedAt))}
                      </td>
                    </tr>
                    {isExpanded && <ExpandedRow key={`${log.id}-expanded`} log={log} />}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
