'use client';

import { useState } from 'react';
import { runVerificationAction } from './actions';
import type { RunVerificationActionResult } from './actions';

const SOURCE_OPTIONS = [
  { label: 'All Sources', value: '' },
  { label: 'NYC Parks', value: 'nyc_parks_api' },
  { label: 'Eventbrite', value: 'eventbrite_api' },
  { label: 'Ticketmaster', value: 'ticketmaster_api' },
  { label: 'Songkick', value: 'songkick_scrape' },
  { label: 'Dice', value: 'dice_scrape' },
];

interface RunVerificationPanelProps {
  onRunComplete: () => void;
}

export default function RunVerificationPanel({ onRunComplete }: RunVerificationPanelProps) {
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
      const result = await runVerificationAction(
        selectedLimit,
        selectedSource || undefined
      );
      setLastResult(result);
      onRunComplete();
    } catch (error) {
      setRunError(String(error));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-zinc-950 border-b border-zinc-800 shrink-0 overflow-x-auto">
      {/* Source selector */}
      <select
        value={selectedSource}
        onChange={(e) => setSelectedSource(e.target.value)}
        disabled={isRunning}
        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
      >
        {SOURCE_OPTIONS.map((option) => (
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
          onChange={(e) => setSelectedLimit(Number(e.target.value))}
          disabled={isRunning}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
        >
          {[5, 10, 25, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">events</span>
      </div>

      {/* Run button */}
      <button
        onClick={handleRunClick}
        disabled={isRunning}
        className="flex items-center gap-2 px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
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

      {/* Last result summary */}
      {lastResult && !runError && (
        <div className="flex items-center gap-3 text-xs ml-2">
          <span className="text-zinc-500">Last run:</span>
          <span className="text-emerald-400">{lastResult.verified} verified</span>
          {lastResult.flagged > 0 && (
            <span className="text-amber-400">{lastResult.flagged} flagged</span>
          )}
          {lastResult.errors > 0 && (
            <span className="text-red-400">{lastResult.errors} errors</span>
          )}
          <span className="text-zinc-600">
            ({(lastResult.durationMs / 1000).toFixed(1)}s)
          </span>
        </div>
      )}

      {runError && (
        <span className="text-xs text-red-400 ml-2">Error: {runError}</span>
      )}
    </div>
  );
}
