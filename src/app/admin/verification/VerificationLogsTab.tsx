'use client';

import { useState, useCallback } from 'react';
import VerificationStatsBar from './VerificationStatsBar';
import RunVerificationPanel from './RunVerificationPanel';
import VerificationTable from './VerificationTable';
import {
  fetchVerificationLogsAction,
  fetchVerificationStatsAction,
  clearVerificationLogsAction,
} from './actions';
import type { VerificationLog, VerificationStats, VerificationStatus } from './types';

interface VerificationLogsTabProps {
  logs: VerificationLog[];
  stats: VerificationStats;
  statusFilter: VerificationStatus | 'all';
  onStatusFilterChange: (status: VerificationStatus | 'all') => void;
  onRefresh: () => Promise<void>;
}

export default function VerificationLogsTab({
  logs,
  stats,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
}: VerificationLogsTabProps) {
  const [isClearArmed, setIsClearArmed] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [localLogs, setLocalLogs] = useState<VerificationLog[]>(logs);
  const [localStats, setLocalStats] = useState<VerificationStats>(stats);

  // Sync from parent when props change
  // (handled via key remounting or parent state updates)
  const displayLogs = localLogs.length > 0 || logs.length === 0 ? localLogs : logs;
  const displayStats = localStats;

  const refreshAll = useCallback(async () => {
    await onRefresh();
    const [freshLogs, freshStats] = await Promise.all([
      fetchVerificationLogsAction(statusFilter),
      fetchVerificationStatsAction(),
    ]);
    setLocalLogs(freshLogs);
    setLocalStats(freshStats);
  }, [onRefresh, statusFilter]);

  async function handleStatusChange(newStatus: VerificationStatus | 'all') {
    onStatusFilterChange(newStatus);
    const freshLogs = await fetchVerificationLogsAction(newStatus);
    setLocalLogs(freshLogs);
  }

  async function handleClearClick() {
    if (!isClearArmed) {
      setIsClearArmed(true);
      setTimeout(() => setIsClearArmed(false), 4000);
      return;
    }

    setIsClearing(true);
    setIsClearArmed(false);
    try {
      await clearVerificationLogsAction();
      setLocalLogs([]);
      const freshStats = await fetchVerificationStatsAction();
      setLocalStats(freshStats);
    } finally {
      setIsClearing(false);
    }
  }

  function downloadLogsAsJson() {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      statusFilter,
      totalRecords: displayLogs.length,
      stats: displayStats,
      logs: displayLogs,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `whim-verification-logs-${timestamp}.json`;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Action bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950 shrink-0">
        <span className="text-sm font-semibold text-white">Integrity Verification</span>

        <div className="ml-auto flex items-center gap-3">
          {displayLogs.length > 0 && (
            <button
              onClick={downloadLogsAsJson}
              title={`Download ${displayLogs.length} log${displayLogs.length !== 1 ? 's' : ''} as JSON`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors"
            >
              ↓ Export JSON
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 tabular-nums">
                {displayLogs.length}
              </span>
            </button>
          )}

          {displayLogs.length > 0 && (
            <button
              onClick={handleClearClick}
              disabled={isClearing}
              title={
                isClearArmed
                  ? 'Click again to confirm — this cannot be undone'
                  : 'Clear all verification logs from the database'
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
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

      {/* Stats bar — reusing existing component */}
      <VerificationStatsBar stats={displayStats} />

      {/* Manual run controls — reusing existing component */}
      <RunVerificationPanel onRunComplete={refreshAll} />

      {/* Log table — reusing existing component */}
      <VerificationTable
        logs={displayLogs}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusChange}
      />
    </div>
  );
}
