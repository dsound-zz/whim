'use client';

import { useState } from 'react';
import { fetchOverviewAction, runQuickAuditAction } from './actions';
import type { DataQualityOverview } from '@/types/audit';
import type { QuickAuditResult } from './actions';

const SOURCE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  ticketmaster_api: { bg: 'bg-blue-900/40', text: 'text-blue-300' },
  eventbrite_api: { bg: 'bg-purple-900/40', text: 'text-purple-300' },
  dice_scrape: { bg: 'bg-pink-900/40', text: 'text-pink-300' },
  seatgeek_api: { bg: 'bg-cyan-900/40', text: 'text-cyan-300' },
  songkick_scrape: { bg: 'bg-amber-900/40', text: 'text-amber-300' },
  nyc_parks_api: { bg: 'bg-green-900/40', text: 'text-green-300' },
  direct_submission: { bg: 'bg-emerald-900/40', text: 'text-emerald-300' },
};

function getSourceBadgeClasses(sourceType: string): string {
  const colors = SOURCE_BADGE_COLORS[sourceType] ?? {
    bg: 'bg-zinc-800/60',
    text: 'text-zinc-400',
  };
  return `${colors.bg} ${colors.text}`;
}

function formatSourceLabel(sourceType: string): string {
  return sourceType
    .replace(/_api$/, '')
    .replace(/_scrape$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

interface StatCardProps {
  label: string;
  value: number | string;
  colorClass: string;
  subtext?: string;
}

function StatCard({ label, value, colorClass, subtext }: StatCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-1">
      <span className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
        {label}
      </span>
      <span className={`text-3xl font-bold tabular-nums ${colorClass}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {subtext && (
        <span className="text-xs text-zinc-600 mt-0.5">{subtext}</span>
      )}
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
        hasIssues
          ? 'bg-amber-950/30 border-amber-800/50'
          : 'bg-emerald-950/30 border-emerald-800/50'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`text-sm font-semibold ${
              hasIssues ? 'text-amber-300' : 'text-emerald-300'
            }`}
          >
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
          aria-label="Dismiss"
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
              result.missingDescriptionCount > 0
                ? 'text-amber-400'
                : 'text-zinc-600'
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
          {result.staleExpired} stale event{result.staleExpired !== 1 ? 's were' : ' was'} automatically expired.
          Stats below have been updated.
        </p>
      )}
    </div>
  );
}

interface OverviewTabProps {
  overview: DataQualityOverview;
  onOverviewRefresh: (overview: DataQualityOverview) => void;
}

export default function OverviewTab({ overview, onOverviewRefresh }: OverviewTabProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<QuickAuditResult | null>(null);

  async function handleQuickAudit() {
    setIsRunning(true);
    setLastResult(null);
    try {
      const result = await runQuickAuditAction();
      setLastResult(result);
      // Update the parent overview with the fresh stats returned from the action
      onOverviewRefresh(result.updatedOverview);
    } finally {
      setIsRunning(false);
    }
  }

  async function handleRefreshOnly() {
    setIsRunning(true);
    try {
      const freshOverview = await fetchOverviewAction();
      onOverviewRefresh(freshOverview);
    } finally {
      setIsRunning(false);
    }
  }

  // Completeness = events that have ALL critical fields (image, description, coords)
  // and are NOT stale. This is the honest number.
  // Total individual issues across all dimensions
  const totalIssues =
    overview.staleEventCount +
    overview.missingImageCount +
    overview.missingDescriptionCount +
    overview.missingCoordsCount;

  // Completeness: what % of (events × 4 dimensions) are filled?
  // Each event has 4 checkable dimensions: not-stale, has-image, has-description, has-coords
  const totalSlots = overview.totalActiveEvents * 4;
  const filledSlots = totalSlots - totalIssues;
  const completenessScore =
    totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

  const completenessColor =
    completenessScore >= 85
      ? 'text-emerald-400'
      : completenessScore >= 65
      ? 'text-amber-400'
      : 'text-red-400';

  return (
    <div className="p-6 space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Data Quality Overview</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Health metrics across all active events
          </p>
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

      {/* Audit result banner */}
      {lastResult && (
        <AuditResultBanner
          result={lastResult}
          onDismiss={() => setLastResult(null)}
        />
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total Active"
          value={overview.totalActiveEvents}
          colorClass="text-zinc-100"
        />
        <StatCard
          label="Completeness"
          value={`${completenessScore}%`}
          colorClass={completenessColor}
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

      {/* Source breakdown table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Source Breakdown</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Data completeness by ingestion source
          </p>
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
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-zinc-500"
                  >
                    No active events found.
                  </td>
                </tr>
              ) : (
                overview.sourceBreakdown.map((source) => {
                  const completenessPercent =
                    source.totalCount > 0
                      ? Math.round(
                          ((source.totalCount -
                            source.missingImageCount -
                            source.missingDescriptionCount -
                            source.missingCoordsCount) /
                            (source.totalCount * 3)) *
                            100
                        )
                      : 0;

                  return (
                    <tr
                      key={source.sourceType}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getSourceBadgeClasses(source.sourceType)}`}
                        >
                          {formatSourceLabel(source.sourceType)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-300 text-right tabular-nums font-medium">
                        {source.totalCount.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span
                          className={
                            source.missingImageCount > 0
                              ? 'text-amber-400'
                              : 'text-zinc-600'
                          }
                        >
                          {source.missingImageCount}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span
                          className={
                            source.missingDescriptionCount > 0
                              ? 'text-amber-400'
                              : 'text-zinc-600'
                          }
                        >
                          {source.missingDescriptionCount}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span
                          className={
                            source.missingCoordsCount > 0
                              ? 'text-red-400'
                              : 'text-zinc-600'
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

      {/* Data Issues & Remediation */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Data Issues & Remediation</h3>
          <p className="text-xs text-zinc-500 mt-0.5">What can be fixed and what&apos;s a source limitation</p>
        </div>
        <div className="divide-y divide-zinc-800/50">
          {/* Stale events */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${overview.staleEventCount > 0 ? 'bg-red-400' : 'bg-emerald-400'}`} />
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
              <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${overview.missingCoordsCount > 0 ? 'bg-red-400' : 'bg-emerald-400'}`} />
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
              <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${overview.missingImageCount > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
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
              <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${overview.missingDescriptionCount > 0 ? 'bg-zinc-500' : 'bg-emerald-400'}`} />
              <div>
                <p className="text-sm text-zinc-200 font-medium">
                  {overview.missingDescriptionCount} missing descriptions
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Source limitation — Ticketmaster, Songkick, and Dice don&apos;t provide descriptions in their APIs/scrapes. Only Eventbrite and NYC Parks include them.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full shrink-0">
              Source limitation
            </span>
          </div>
        </div>
      </div>

      {/* CLI hint */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg px-4 py-3 flex items-start gap-3">
        <span className="text-zinc-600 text-base mt-0.5">💻</span>
        <div>
          <p className="text-xs font-medium text-zinc-400">For deep audits (coordinates + duplicates)</p>
          <code className="text-xs text-zinc-500 font-mono">
            npm run audit:quality -- --limit 200 --fix-stale
          </code>
        </div>
      </div>
    </div>
  );
}
