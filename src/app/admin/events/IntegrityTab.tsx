'use client';

import { useState, useCallback, Fragment } from 'react';
import type { VerificationLog, VerificationStats, VerificationStatus } from '@/types/verification';
import { VERIFICATION_STATUS_META } from '@/app/admin/verification/types';
import {
  fetchVerificationLogsAction,
  fetchVerificationStatsAction,
  runVerificationAction,
  clearVerificationLogsAction,
} from '@/app/admin/verification/actions';
import type { RunVerificationActionResult } from '@/app/admin/verification/actions';

// ─── Props ────────────────────────────────────────────────────────────────────

interface IntegrityTabProps {
  initialLogs: VerificationLog[];
  initialStats: VerificationStats;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS: Array<{ label: string; value: VerificationStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Verified', value: 'verified' },
  { label: 'Content Flags', value: 'flagged_content' },
  { label: 'Coord Flags', value: 'flagged_coordinates' },
  { label: 'Both Flagged', value: 'flagged_both' },
  { label: 'Skipped', value: 'skipped' },
  { label: 'Errors', value: 'error' },
];

const RUN_SOURCE_OPTIONS = [
  { label: 'All Sources', value: '' },
  { label: 'NYC Parks', value: 'nyc_parks_api' },
  { label: 'Eventbrite', value: 'eventbrite_api' },
  { label: 'Ticketmaster', value: 'ticketmaster_api' },
  { label: 'SeatGeek', value: 'seatgeek_api' },
  { label: 'Songkick', value: 'songkick_scrape' },
  { label: 'Dice', value: 'dice_scrape' },
];

const RUN_LIMIT_OPTIONS = [5, 10, 25, 50];

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function ExpandedLogRow({ log }: { log: VerificationLog }) {
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

// ─── Stats Bar ────────────────────────────────────────────────────────────────

interface StatsBarProps {
  stats: VerificationStats;
}

function StatsBar({ stats }: StatsBarProps) {
  const formattedLastChecked = stats.lastCheckedAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(stats.lastCheckedAt))
    : 'Never';

  const statItems: Array<{ label: string; value: number; colorClass: string }> = [
    { label: 'Total Checked', value: stats.totalChecked, colorClass: 'text-zinc-200' },
    {
      label: 'Verified',
      value: stats.verified,
      colorClass: VERIFICATION_STATUS_META.verified.badgeText,
    },
    {
      label: 'Content Flags',
      value: stats.flaggedContent,
      colorClass: VERIFICATION_STATUS_META.flagged_content.badgeText,
    },
    {
      label: 'Coord Flags',
      value: stats.flaggedCoordinates,
      colorClass: VERIFICATION_STATUS_META.flagged_coordinates.badgeText,
    },
    {
      label: 'Both Flagged',
      value: stats.flaggedBoth,
      colorClass: VERIFICATION_STATUS_META.flagged_both.badgeText,
    },
    {
      label: 'Skipped',
      value: stats.skipped,
      colorClass: VERIFICATION_STATUS_META.skipped.badgeText,
    },
    {
      label: 'Errors',
      value: stats.errors,
      colorClass: VERIFICATION_STATUS_META.error.badgeText,
    },
  ];

  return (
    <div className="flex flex-wrap items-stretch gap-px bg-zinc-800 rounded-xl overflow-hidden border border-zinc-800">
      {/* Label cell */}
      <div className="flex flex-col justify-center px-5 py-3 bg-zinc-900 min-w-max">
        <span className="text-sm font-semibold text-white tracking-tight">Event Integrity</span>
        <span className="text-xs text-zinc-500 mt-0.5">Last run: {formattedLastChecked}</span>
      </div>
      {/* Stat chips */}
      {statItems.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-center justify-center px-5 py-3 bg-zinc-900 min-w-max"
        >
          <span className={`text-2xl font-bold tabular-nums ${item.colorClass}`}>
            {item.value.toLocaleString()}
          </span>
          <span className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wide">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Run Verification Panel ───────────────────────────────────────────────────

interface RunVerificationPanelProps {
  onRunComplete: () => void;
}

function RunVerificationPanel({ onRunComplete }: RunVerificationPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<RunVerificationActionResult | null>(null);
  const [selectedLimit, setSelectedLimit] = useState(10);
  const [selectedSource, setSelectedSource] = useState('');
  const [runError, setRunError] = useState<string | null>(null);

  async function handleRunClick() {
    setIsRunning(true);
    setLastResult(null);
    setRunError(null);
    try {
      const result = await runVerificationAction(selectedLimit, selectedSource || undefined);
      setLastResult(result);
      onRunComplete();
    } catch (error) {
      setRunError(String(error));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Run Integrity Check</h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          Fetches ticket URLs and re-geocodes venues for a sample of events
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Source selector */}
        <select
          value={selectedSource}
          onChange={(evt) => setSelectedSource(evt.target.value)}
          disabled={isRunning}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
        >
          {RUN_SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Limit selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Check</span>
          <select
            value={selectedLimit}
            onChange={(evt) => setSelectedLimit(Number(evt.target.value))}
            disabled={isRunning}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          >
            {RUN_LIMIT_OPTIONS.map((limit) => (
              <option key={limit} value={limit}>
                {limit}
              </option>
            ))}
          </select>
          <span className="text-xs text-zinc-500">events</span>
        </div>

        {/* Run button */}
        <button
          onClick={handleRunClick}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {isRunning ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Running…
            </>
          ) : (
            <>
              <span>▶</span>
              Run Check
            </>
          )}
        </button>
      </div>

      {/* Inline result summary */}
      {lastResult && !runError && (
        <div className="flex flex-wrap items-center gap-4 text-xs pt-2 border-t border-zinc-800">
          <span className="text-zinc-500">Last run:</span>
          <span className="text-emerald-400 font-medium">{lastResult.verified} verified</span>
          {lastResult.flagged > 0 && (
            <span className="text-amber-400 font-medium">{lastResult.flagged} flagged</span>
          )}
          {lastResult.skipped > 0 && (
            <span className="text-zinc-500">{lastResult.skipped} skipped</span>
          )}
          {lastResult.errors > 0 && (
            <span className="text-red-400 font-medium">{lastResult.errors} errors</span>
          )}
          <span className="text-zinc-600">
            ({lastResult.checkedCount} checked · {(lastResult.durationMs / 1000).toFixed(1)}s)
          </span>
        </div>
      )}

      {runError && (
        <p className="text-xs text-red-400 border-t border-zinc-800 pt-2">Error: {runError}</p>
      )}
    </div>
  );
}

// ─── Log Table ────────────────────────────────────────────────────────────────

interface LogTableProps {
  logs: VerificationLog[];
  statusFilter: VerificationStatus | 'all';
  onStatusFilterChange: (status: VerificationStatus | 'all') => void;
  isRefreshing: boolean;
}

function LogTable({ logs, statusFilter, onStatusFilterChange, isRefreshing }: LogTableProps) {
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onStatusFilterChange(option.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === option.value
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="ml-auto shrink-0 flex items-center gap-2">
          {isRefreshing && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="w-3 h-3 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
              Refreshing…
            </span>
          )}
          <input
            type="text"
            placeholder="Search events…"
            value={searchQuery}
            onChange={(evt) => setSearchQuery(evt.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-48"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Status
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Event
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Venue
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Coord Δ
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                LLM
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Mismatch Reason
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Checked At
              </th>
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
                      <td className="px-4 py-3 text-zinc-400 max-w-xs">
                        <span className="line-clamp-1">{log.eventVenueName ?? '—'}</span>
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
                    {isExpanded && <ExpandedLogRow key={`${log.id}-expanded`} log={log} />}
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IntegrityTab({ initialLogs, initialStats }: IntegrityTabProps) {
  const [logs, setLogs] = useState<VerificationLog[]>(initialLogs);
  const [stats, setStats] = useState<VerificationStats>(initialStats);
  const [statusFilter, setStatusFilter] = useState<VerificationStatus | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearArmed, setIsClearArmed] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [freshLogs, freshStats] = await Promise.all([
        fetchVerificationLogsAction(statusFilter),
        fetchVerificationStatsAction(),
      ]);
      setLogs(freshLogs);
      setStats(freshStats);
    } finally {
      setIsRefreshing(false);
    }
  }, [statusFilter]);

  async function handleStatusFilterChange(newStatus: VerificationStatus | 'all') {
    setStatusFilter(newStatus);
    setIsRefreshing(true);
    try {
      const freshLogs = await fetchVerificationLogsAction(newStatus);
      setLogs(freshLogs);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleClearClick() {
    if (!isClearArmed) {
      setIsClearArmed(true);
      setTimeout(() => setIsClearArmed(false), 4_000);
      return;
    }
    setIsClearing(true);
    setIsClearArmed(false);
    try {
      const { deletedCount } = await clearVerificationLogsAction();
      console.info(`[IntegrityTab] Cleared ${deletedCount} verification log rows.`);
      setLogs([]);
      const freshStats = await fetchVerificationStatsAction();
      setStats(freshStats);
    } finally {
      setIsClearing(false);
    }
  }

  function handleDownloadJson() {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      statusFilter,
      totalRecords: logs.length,
      stats,
      logs,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `whim-verification-logs-${timestamp}.json`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Header / action bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Integrity Verification</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Content and coordinate checks for active events
          </p>
        </div>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <button
              onClick={handleDownloadJson}
              title={`Download ${logs.length} log${logs.length !== 1 ? 's' : ''} as JSON`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors"
            >
              ↓ Export JSON
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 tabular-nums">
                {logs.length}
              </span>
            </button>
          )}
          {logs.length > 0 && (
            <button
              onClick={handleClearClick}
              disabled={isClearing}
              title={
                isClearArmed
                  ? 'Click again to confirm — this cannot be undone'
                  : 'Clear all verification logs from the database'
              }
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isClearArmed
                  ? 'border-red-600 bg-red-950/40 text-red-400 animate-pulse'
                  : 'border-zinc-700 hover:border-red-700 text-zinc-500 hover:text-red-400'
              }`}
            >
              {isClearing ? (
                <>
                  <span className="w-3 h-3 border-2 border-red-800 border-t-red-400 rounded-full animate-spin" />
                  Clearing…
                </>
              ) : isClearArmed ? (
                '⚠ Confirm Clear'
              ) : (
                '✕ Clear All'
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <StatsBar stats={stats} />

      {/* ── Run verification panel ───────────────────────────────────────── */}
      <RunVerificationPanel onRunComplete={refreshData} />

      {/* ── Log table ────────────────────────────────────────────────────── */}
      <LogTable
        logs={logs}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        isRefreshing={isRefreshing}
      />
    </div>
  );
}
