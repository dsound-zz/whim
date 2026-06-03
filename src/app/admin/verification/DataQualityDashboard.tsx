'use client';

import { useState, useCallback } from 'react';
import {
  fetchVerificationLogsAction,
  fetchVerificationStatsAction,
} from './actions';
import type { VerificationLog, VerificationStats, VerificationStatus } from './types';
import type { DataQualityOverview } from '@/types/audit';
import OverviewTab from './OverviewTab';
import StaleEventsTab from './StaleEventsTab';
import DataCompletenessTab from './DataCompletenessTab';
import CoordinateAuditTab from './CoordinateAuditTab';
import DuplicateDetectionTab from './DuplicateDetectionTab';
import VerificationLogsTab from './VerificationLogsTab';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'stale', label: 'Stale Events' },
  { id: 'completeness', label: 'Data Completeness' },
  { id: 'coordinates', label: 'Coordinate Audit' },
  { id: 'duplicates', label: 'Duplicate Detection' },
  { id: 'logs', label: 'Verification Logs' },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface DataQualityDashboardProps {
  initialLogs: VerificationLog[];
  initialStats: VerificationStats;
  initialOverview: DataQualityOverview;
}

export default function DataQualityDashboard({
  initialLogs,
  initialStats,
  initialOverview,
}: DataQualityDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [logs, setLogs] = useState<VerificationLog[]>(initialLogs);
  const [stats, setStats] = useState<VerificationStats>(initialStats);
  const [overview, setOverview] = useState<DataQualityOverview>(initialOverview);
  const [statusFilter, setStatusFilter] = useState<VerificationStatus | 'all'>('all');

  const refreshVerificationData = useCallback(async () => {
    const [freshLogs, freshStats] = await Promise.all([
      fetchVerificationLogsAction(statusFilter),
      fetchVerificationStatsAction(),
    ]);
    setLogs(freshLogs);
    setStats(freshStats);
  }, [statusFilter]);

  async function handleStatusFilterChange(newStatus: VerificationStatus | 'all') {
    setStatusFilter(newStatus);
    const freshLogs = await fetchVerificationLogsAction(newStatus);
    setLogs(freshLogs);
  }

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-200 overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 bg-black shrink-0">
        <a
          href="/admin/events"
          className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors"
        >
          ← Events
        </a>
        <span className="text-zinc-700">|</span>
        <h1 className="text-sm font-semibold text-white">Data Quality Audit</h1>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-zinc-800 bg-zinc-950 shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-black shadow-sm'
                : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview' && (
          <OverviewTab overview={overview} onOverviewRefresh={setOverview} />
        )}
        {activeTab === 'stale' && <StaleEventsTab />}
        {activeTab === 'completeness' && <DataCompletenessTab />}
        {activeTab === 'coordinates' && <CoordinateAuditTab />}
        {activeTab === 'duplicates' && <DuplicateDetectionTab />}
        {activeTab === 'logs' && (
          <VerificationLogsTab
            logs={logs}
            stats={stats}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilterChange}
            onRefresh={refreshVerificationData}
          />
        )}
      </div>
    </div>
  );
}
