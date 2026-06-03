'use client';

export default function DuplicateDetectionTab() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Duplicate Detection</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          Cross-platform duplicate event scanning
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
        <div className="text-4xl mb-4">🔍</div>
        <p className="text-zinc-300 font-medium text-lg">
          Duplicate scanning runs via the batch audit script
        </p>
        <p className="text-zinc-500 text-sm mt-2 max-w-md mx-auto">
          The duplicate detection engine uses trigram similarity on event titles and
          venue proximity (within 160m) across a ±4 hour time window. It runs as part
          of the nightly <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 text-xs">audit-data-quality</code> cron job.
        </p>

        <div className="mt-6 flex items-center justify-center gap-6 text-sm">
          <div className="flex flex-col items-center">
            <span className="text-zinc-400 font-medium">Title Similarity</span>
            <span className="text-zinc-500 text-xs mt-0.5">&gt; 0.3 trigram threshold</span>
          </div>
          <div className="w-px h-8 bg-zinc-800" />
          <div className="flex flex-col items-center">
            <span className="text-zinc-400 font-medium">Venue Proximity</span>
            <span className="text-zinc-500 text-xs mt-0.5">Within 160 meters</span>
          </div>
          <div className="w-px h-8 bg-zinc-800" />
          <div className="flex flex-col items-center">
            <span className="text-zinc-400 font-medium">Time Window</span>
            <span className="text-zinc-500 text-xs mt-0.5">±4 hours from start</span>
          </div>
        </div>

        <div className="mt-8 p-4 bg-zinc-950 border border-zinc-800 rounded-lg max-w-sm mx-auto">
          <p className="text-xs text-zinc-500 font-mono">
            npm run audit:data-quality -- --check duplicates
          </p>
        </div>
      </div>
    </div>
  );
}
