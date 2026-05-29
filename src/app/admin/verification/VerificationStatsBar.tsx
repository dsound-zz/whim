'use client';

import type { VerificationStats } from './types';
import { VERIFICATION_STATUS_META } from './types';

interface VerificationStatsBarProps {
  stats: VerificationStats;
}

function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-3 border-r border-zinc-800 last:border-r-0">
      <span className={`text-2xl font-bold tabular-nums ${colorClass}`}>
        {value.toLocaleString()}
      </span>
      <span className="text-xs text-zinc-500 mt-0.5 uppercase tracking-wide">{label}</span>
    </div>
  );
}

export default function VerificationStatsBar({ stats }: VerificationStatsBarProps) {
  const formattedLastChecked = stats.lastCheckedAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(stats.lastCheckedAt))
    : 'Never';

  return (
    <div className="flex items-stretch bg-zinc-950 border-b border-zinc-800 overflow-x-auto shrink-0">
      {/* Title */}
      <div className="flex flex-col justify-center px-6 py-3 border-r border-zinc-800 min-w-max">
        <span className="text-sm font-semibold text-white tracking-tight">
          Event Integrity
        </span>
        <span className="text-xs text-zinc-500 mt-0.5">
          Last run: {formattedLastChecked}
        </span>
      </div>

      <StatCard
        label="Total Checked"
        value={stats.totalChecked}
        colorClass="text-zinc-200"
      />
      <StatCard
        label="Verified"
        value={stats.verified}
        colorClass={VERIFICATION_STATUS_META.verified.badgeText}
      />
      <StatCard
        label="Content Flags"
        value={stats.flaggedContent}
        colorClass={VERIFICATION_STATUS_META.flagged_content.badgeText}
      />
      <StatCard
        label="Coord Flags"
        value={stats.flaggedCoordinates}
        colorClass={VERIFICATION_STATUS_META.flagged_coordinates.badgeText}
      />
      <StatCard
        label="Both Flagged"
        value={stats.flaggedBoth}
        colorClass={VERIFICATION_STATUS_META.flagged_both.badgeText}
      />
      <StatCard
        label="Skipped"
        value={stats.skipped}
        colorClass={VERIFICATION_STATUS_META.skipped.badgeText}
      />
      <StatCard
        label="Errors"
        value={stats.errors}
        colorClass={VERIFICATION_STATUS_META.error.badgeText}
      />
    </div>
  );
}
