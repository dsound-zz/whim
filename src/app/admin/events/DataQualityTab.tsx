'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DataQualityOverview, StaleEventRow } from '@/types/audit';
import type { QuickAuditResult } from '@/app/admin/verification/actions';
import {
  runQuickAuditAction,
  fetchOverviewAction,
  fetchStaleEventsAction,
  expireStaleEventsAction,
} from '@/app/admin/verification/actions';
import { getSourceMeta, getSourceBadgeClasses } from '@/lib/utils/sourceColors';

// ─── Props ────────────────────────────────────────────────────────────────────

interface DataQualityTabProps {
  overview: DataQualityOverview;
  onOverviewRefresh: (updatedOverview: DataQualityOverview) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function computeSourceCompletenessPercent(source: DataQualityOverview['sourceBreakdown'][number]): number {
  if (source.totalCount === 0) return 0;
  const totalSlots = source.totalCount * 3; // image, description, coords
  const filledSlots =
    totalSlots -
    source.missingImageCount -
    source.missingDescriptionCount -
    source.missingCoordsCount;
  return Math.round((filledSlots / totalSlots) * 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  colorClass: string;
  subtext?: string;
}

function StatCard({ label, value, colorClass, subtext }: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-1">
      <span className="text-xs text-zinc-500 uppercase tracking-wide font-medium">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${colorClass}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {subtext && <span className="text-xs text-zinc-600 mt-0.5">{subtext}</span>}
    </div>
  );
}

interface AuditResultBannerProps {
  result: QuickAuditResult;
  onDismiss: () => void;
}

function AuditResultBanner({ result, onDismiss }: AuditResultBannerProps) {
  const hasIssues =
    result.staleFound > 0 ||
    result.missingImageCount > 0 ||
    result.missingDescriptionCount > 0 ||
    result.missingCoordsCount > 0 ||
    result.priceIssueCount > 0;

  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-3 ${
        hasIssues ? 'bg-amber-950/30 border-amber-800/50' : 'bg-emerald-950/30 border-emerald-800/50'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold ${hasIssues ? 'text-amber-300' : 'text-emerald-300'}`}>
            {hasIssues ? '⚠ Issues found' : '✓ All clear'}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Scanned {result.scannedCount.toLocaleString()} events in{' '}
            {(result.durationMs / 1000).toFixed(1)}s
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-zinc-600 hover:text-zinc-400 text-lg leading-none shrink-0"
          aria-label="Dismiss audit result banner"
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <div className="bg-zinc-900/60 rounded-lg p-3 text-center">
          <p
            className={`text-xl font-bold tabular-nums ${
              result.staleExpired > 0 ? 'text-red-400' : 'text-zinc-600'
            }`}
          >
            {result.staleExpired}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">Stale expired</p>
        </div>
        <div className="bg-zinc-900/60 rounded-lg p-3 text-center">
          <p
            className={`text-xl font-bold tabular-nums ${
              result.missingImageCount > 0 ? 'text-amber-400' : 'text-zinc-600'
            }`}
          >
            {result.missingImageCount}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">Missing images</p>
        </div>
        <div className="bg-zinc-900/60 rounded-lg p-3 text-center">
          <p
            className={`text-xl font-bold tabular-nums ${
              result.missingDescriptionCount > 0 ? 'text-amber-400' : 'text-zinc-600'
            }`}
          >
            {result.missingDescriptionCount}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">Missing descriptions</p>
        </div>
        <div className="bg-zinc-900/60 rounded-lg p-3 text-center">
          <p
            className={`text-xl font-bold tabular-nums ${
              result.missingCoordsCount > 0 ? 'text-red-400' : 'text-zinc-600'
            }`}
          >
            {result.missingCoordsCount}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">Missing coords</p>
        </div>
        <div className="bg-zinc-900/60 rounded-lg p-3 text-center">
          <p
            className={`text-xl font-bold tabular-nums ${
              result.priceIssueCount > 0 ? 'text-amber-400' : 'text-zinc-600'
            }`}
          >
            {result.priceIssueCount}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">Price issues</p>
        </div>
      </div>

      {result.staleExpired > 0 && (
        <p className="text-xs text-zinc-500 border-t border-zinc-800/50 pt-2 mt-1">
          {result.staleExpired} stale event{result.staleExpired !== 1 ? 's were' : ' was'} automatically
          expired. Stats below have been updated.
        </p>
      )}
    </div>
  );
}

// ─── Stale Events Section ─────────────────────────────────────────────────────

interface StaleEventsSectionProps {
  staleEvents: StaleEventRow[];
  isLoading: boolean;
  onStaleEventsChange: (updatedEvents: StaleEventRow[]) => void;
}

function StaleEventsSection({
  staleEvents,
  isLoading,
  onStaleEventsChange,
}: StaleEventsSectionProps) {
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [isExpiring, setIsExpiring] = useState(false);
  const [expireAllArmed, setExpireAllArmed] = useState(false);

  function handleToggleSelectAll() {
    if (selectedEventIds.size === staleEvents.length) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(staleEvents.map((event) => event.id)));
    }
  }

  function handleToggleRow(eventId: string) {
    setSelectedEventIds((previous) => {
      const next = new Set(previous);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }

  async function handleExpireSelected() {
    if (selectedEventIds.size === 0) return;

    if (!expireAllArmed) {
      setExpireAllArmed(true);
      setTimeout(() => setExpireAllArmed(false), 4_000);
      return;
    }

    setIsExpiring(true);
    setExpireAllArmed(false);
    try {
      const idsToExpire = Array.from(selectedEventIds);
      await expireStaleEventsAction(idsToExpire);
      const remaining = staleEvents.filter((event) => !selectedEventIds.has(event.id));
      onStaleEventsChange(remaining);
      setSelectedEventIds(new Set());
    } finally {
      setIsExpiring(false);
    }
  }

  const isAllSelected = staleEvents.length > 0 && selectedEventIds.size === staleEvents.length;
  const isSomeSelected = selectedEventIds.size > 0 && selectedEventIds.size < staleEvents.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
        <span className="ml-3 text-sm text-zinc-500">Loading stale events…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stale events action bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            Active events whose dates have already passed —{' '}
            <span className="text-zinc-300 font-medium tabular-nums">{staleEvents.length}</span> found
          </p>
        </div>
        {staleEvents.length > 0 && (
          <button
            onClick={handleExpireSelected}
            disabled={isExpiring || selectedEventIds.size === 0}
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
            ) : selectedEventIds.size > 0 ? (
              `Expire Selected (${selectedEventIds.size})`
            ) : (
              'Select events to expire'
            )}
          </button>
        )}
      </div>

      {staleEvents.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <div className="text-3xl mb-3">✓</div>
          <p className="text-zinc-400 font-medium">No stale events found</p>
          <p className="text-zinc-600 text-sm mt-1">All active events have future start dates.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-900/80 border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeSelected;
                      }}
                      onChange={handleToggleSelectAll}
                      aria-label="Select all stale events"
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Title
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Venue
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Source
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Start Date
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {staleEvents.map((event) => {
                  const isSelected = selectedEventIds.has(event.id);
                  const sourceMeta = getSourceMeta(event.sourceType);
                  return (
                    <tr
                      key={event.id}
                      onClick={() => handleToggleRow(event.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/20'
                      }`}
                    >
                      <td className="px-4 py-3" onClick={(evt) => evt.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRow(event.id)}
                          aria-label={`Select ${event.title}`}
                          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <span className="text-zinc-200 font-medium line-clamp-1">{event.title}</span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 max-w-xs">
                        <span className="line-clamp-1">{event.venueName ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getSourceBadgeClasses(event.sourceType)}`}
                        >
                          {sourceMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 tabular-nums whitespace-nowrap">
                        {dateFormatter.format(new Date(event.startAt))}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-300">
                          Stale
                        </span>
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DataQualityTab({ overview, onOverviewRefresh }: DataQualityTabProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [lastAuditResult, setLastAuditResult] = useState<QuickAuditResult | null>(null);
  const [staleEvents, setStaleEvents] = useState<StaleEventRow[]>([]);
  const [isLoadingStale, setIsLoadingStale] = useState(true);

  // Fetch stale events on mount
  useEffect(() => {
    fetchStaleEventsAction().then((rows) => {
      setStaleEvents(rows);
      setIsLoadingStale(false);
    });
  }, []);

  const handleStaleEventsChange = useCallback((updatedEvents: StaleEventRow[]) => {
    setStaleEvents(updatedEvents);
  }, []);

  async function handleQuickAudit() {
    setIsRunning(true);
    setLastAuditResult(null);
    try {
      const result = await runQuickAuditAction();
      setLastAuditResult(result);
      onOverviewRefresh(result.updatedOverview);
      // Refresh stale events list since the audit may have expired some
      const freshStale = await fetchStaleEventsAction();
      setStaleEvents(freshStale);
    } finally {
      setIsRunning(false);
    }
  }

  async function handleRefreshOnly() {
    setIsRunning(true);
    try {
      const [freshOverview, freshStale] = await Promise.all([
        fetchOverviewAction(),
        fetchStaleEventsAction(),
      ]);
      onOverviewRefresh(freshOverview);
      setStaleEvents(freshStale);
    } finally {
      setIsRunning(false);
    }
  }

  // Completeness = (events × 4 dimensions) minus all gap types
  const totalIssues =
    overview.staleEventCount +
    overview.missingImageCount +
    overview.missingDescriptionCount +
    overview.missingCoordsCount;

  const totalSlots = overview.totalActiveEvents * 4;
  const filledSlots = totalSlots - totalIssues;
  const completenessScore = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

  const completenessColorClass =
    completenessScore >= 85
      ? 'text-emerald-400'
      : completenessScore >= 65
      ? 'text-amber-400'
      : 'text-red-400';

  return (
    <div className="p-6 space-y-6">
      {/* ── Header / action bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Data Quality</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Health metrics across all active events</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshOnly}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-sm font-medium transition-colors"
          >
            {isRunning ? (
              <span className="w-3 h-3 border-2 border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
            ) : (
              '↻'
            )}
            Refresh
          </button>
          <button
            onClick={handleQuickAudit}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {isRunning ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Running…
              </>
            ) : (
              '⚡ Run Quick Audit'
            )}
          </button>
        </div>
      </div>

      {/* ── Audit result banner ──────────────────────────────────────────── */}
      {lastAuditResult && (
        <AuditResultBanner result={lastAuditResult} onDismiss={() => setLastAuditResult(null)} />
      )}

      {/* ── Stats grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Active" value={overview.totalActiveEvents} colorClass="text-zinc-100" />
        <StatCard
          label="Completeness"
          value={`${completenessScore}%`}
          colorClass={completenessColorClass}
          subtext={`${totalIssues} total gaps`}
        />
        <StatCard
          label="Stale Events"
          value={overview.staleEventCount}
          colorClass={overview.staleEventCount > 0 ? 'text-red-400' : 'text-emerald-400'}
          subtext="Past end date, still active"
        />
        <StatCard
          label="Missing Images"
          value={overview.missingImageCount}
          colorClass={overview.missingImageCount > 0 ? 'text-amber-400' : 'text-emerald-400'}
        />
        <StatCard
          label="Missing Descriptions"
          value={overview.missingDescriptionCount}
          colorClass={overview.missingDescriptionCount > 0 ? 'text-amber-400' : 'text-emerald-400'}
        />
        <StatCard
          label="Missing Coords"
          value={overview.missingCoordsCount}
          colorClass={overview.missingCoordsCount > 0 ? 'text-red-400' : 'text-emerald-400'}
        />
      </div>

      {/* ── Source breakdown table ───────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Source Breakdown</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Data completeness by ingestion source</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-900/80">
              <tr>
                <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Source
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">
                  Total
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">
                  Missing Image
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">
                  Missing Desc
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">
                  Missing Coords
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-right">
                  Completeness
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {overview.sourceBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-zinc-500">
                    No active events found.
                  </td>
                </tr>
              ) : (
                overview.sourceBreakdown.map((source) => {
                  const completenessPercent = computeSourceCompletenessPercent(source);
                  const sourceMeta = getSourceMeta(source.sourceType);
                  return (
                    <tr
                      key={source.sourceType}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getSourceBadgeClasses(source.sourceType)}`}
                        >
                          {sourceMeta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-300 text-right tabular-nums font-medium">
                        {source.totalCount.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span
                          className={
                            source.missingImageCount > 0 ? 'text-amber-400' : 'text-zinc-600'
                          }
                        >
                          {source.missingImageCount}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span
                          className={
                            source.missingDescriptionCount > 0 ? 'text-amber-400' : 'text-zinc-600'
                          }
                        >
                          {source.missingDescriptionCount}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span
                          className={
                            source.missingCoordsCount > 0 ? 'text-red-400' : 'text-zinc-600'
                          }
                        >
                          {source.missingCoordsCount}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                completenessPercent >= 80
                                  ? 'bg-emerald-500'
                                  : completenessPercent >= 50
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${completenessPercent}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-400 tabular-nums w-8 text-right">
                            {completenessPercent}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Data Issues & Remediation ────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Data Issues &amp; Remediation</h3>
          <p className="text-xs text-zinc-500 mt-0.5">What can be fixed and what&apos;s a source limitation</p>
        </div>
        <div className="divide-y divide-zinc-800/50">
          {/* Stale events */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                  overview.staleEventCount > 0 ? 'bg-red-400' : 'bg-emerald-400'
                }`}
              />
              <div>
                <p className="text-sm text-zinc-200 font-medium">
                  {overview.staleEventCount} stale events
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Past their end date but still marked active
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded-full shrink-0">
              Auto-fixable
            </span>
          </div>

          {/* Missing coords */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                  overview.missingCoordsCount > 0 ? 'bg-red-400' : 'bg-emerald-400'
                }`}
              />
              <div>
                <p className="text-sm text-zinc-200 font-medium">
                  {overview.missingCoordsCount} missing coordinates
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Can re-geocode events that have a venue name or address via Mapbox
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded-full shrink-0">
              Partially fixable
            </span>
          </div>

          {/* Missing images */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                  overview.missingImageCount > 0 ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
              />
              <div>
                <p className="text-sm text-zinc-200 font-medium">
                  {overview.missingImageCount} missing images
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Music events can be enriched via Bandsintown. Run{' '}
                  <code className="text-zinc-400 font-mono">npm run enrich:bandsintown</code>
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded-full shrink-0">
              Partially fixable
            </span>
          </div>

          {/* Missing descriptions */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                  overview.missingDescriptionCount > 0 ? 'bg-zinc-500' : 'bg-emerald-400'
                }`}
              />
              <div>
                <p className="text-sm text-zinc-200 font-medium">
                  {overview.missingDescriptionCount} missing descriptions
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Source limitation — Ticketmaster, Songkick, and Dice don&apos;t provide descriptions
                  in their APIs/scrapes. Only Eventbrite and NYC Parks include them.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full shrink-0">
              Source limitation
            </span>
          </div>
        </div>
      </div>

      {/* ── Stale Events Section ─────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Stale Events</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Select individual events or all to batch-expire them
          </p>
        </div>
        <div className="p-5">
          <StaleEventsSection
            staleEvents={staleEvents}
            isLoading={isLoadingStale}
            onStaleEventsChange={handleStaleEventsChange}
          />
        </div>
      </div>

      {/* ── CLI hint ─────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg px-4 py-3 flex items-start gap-3">
        <span className="text-zinc-600 text-base mt-0.5">💻</span>
        <div>
          <p className="text-xs font-medium text-zinc-400">
            For deep audits (coordinates + duplicates)
          </p>
          <code className="text-xs text-zinc-500 font-mono">
            npm run audit:quality -- --limit 200 --fix-stale
          </code>
        </div>
      </div>
    </div>
  );
}
