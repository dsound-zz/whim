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

interface VerificationDashboardProps {
  initialLogs: VerificationLog[];
  initialStats: VerificationStats;
}

export default function VerificationDashboard({
  initialLogs,
  initialStats,
}: VerificationDashboardProps) {
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
    // First click arms the button; second click within 4s executes the delete.
    if (!isClearArmed) {
      setIsClearArmed(true);
      setTimeout(() => setIsClearArmed(false), 4_000);
      return;
    }

    setIsClearing(true);
    setIsClearArmed(false);
    try {
      const { deletedCount } = await clearVerificationLogsAction();
      console.log(`[Verification] Cleared ${deletedCount} log rows`);
      // Reset local state immediately so the UI goes empty without a reload.
      setLogs([]);
      const freshStats = await fetchVerificationStatsAction();
      setStats(freshStats);
    } finally {
      setIsClearing(false);
    }
  }

  function downloadLogsAsJson() {
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
    <div className="flex flex-col h-screen w-full bg-zinc-950 text-zinc-200 overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 bg-black shrink-0">
        <a href="/admin/events" className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors">
          ← Events
        </a>
        <span className="text-zinc-700">|</span>
        <h1 className="text-sm font-semibold text-white">Integrity Verification</h1>

        <div className="ml-auto flex items-center gap-3">
          {isRefreshing && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="w-3 h-3 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
              Refreshing…
            </span>
          )}

          {logs.length > 0 && (
            <button
              onClick={downloadLogsAsJson}
              title={`Download ${logs.length} log${logs.length !== 1 ? 's' : ''} as JSON`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors"
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
              title={isClearArmed ? 'Click again to confirm — this cannot be undone' : 'Clear all verification logs from the database'}
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

      {/* Stats bar */}
      <VerificationStatsBar stats={stats} />

      {/* Manual run controls */}
      <RunVerificationPanel onRunComplete={refreshData} />

      {/* Log table */}
      <VerificationTable
        logs={logs}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
      />
    </div>
  );
}
